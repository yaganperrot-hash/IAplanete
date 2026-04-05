// civParserLLM.js — Parseur de texte libre en JSON structuré
// Utilise le même provider que le LLM Civ (Ollama ou Gemini selon LLM_PROVIDER).

'use strict';

const parseJ = (v, fb) => {
  try {
    return JSON.parse(v != null ? v : JSON.stringify(fb));
  } catch {
    return fb;
  }
};

/**
 * Prompt du parseur (ne pas modifier)
 */
const PARSER_SYSTEM = `Tu es un parseur. Tu reçois la décision narrative d'une civilisation de jeu.

RÈGLE ABSOLUE : tu extrais ce que la civilisation a dit.
Tu n'inventes pas d'effets. Tu ne complètes pas ses intentions.
Tu ne juges pas si c'est réaliste. Tu traduis fidèlement.
Si tu ne comprends pas une action, tu gardes le texte brut et tu mets confiance: 0.2.

TYPES MÉCANIQUES CONNUS :
  affecter           → assigner des personnes à une tâche existante
  construire         → bâtir quelque chose de nouveau
  explorer           → envoyer des éclaireurs dans une direction
  coloniser          → s'installer dans un territoire
  attaquer           → offensive militaire contre une civ nommée
  diplomatie         → alliance / paix / commerce avec une civ nommée
  envoyer_emissaire  → envoyer des représentants vers une civ
  envoyer_marchands  → envoyer des marchands vers une civ
  espionner          → espionnage d'une civ
  loi                → décret ou loi interne
  recruter           → enrôler des soldats
  abandonner         → quitter ou démanteler une structure
  chasser            → chasse d'animaux
  utiliser_relique   → utiliser un objet en possession
  etudier_relique    → étudier un objet en possession

Si l'action ne correspond à aucun type connu, applique cette priorité :

  ÉTAPE 1 — Cherche le type connu le plus proche :
    - Explorer/cartographier/reconnaître/scouter → "explorer"
    - Envoyer marchands/route commerciale/commerce → "envoyer_marchands"
    - Envoyer émissaire/ambassadeur/alliance → "envoyer_emissaire"
    - Espionner/infiltrer/renseignement → "espionner"
    - Construire/fortifier/ériger/aménager → "construire"
    - Coloniser/s'installer/fonder → "coloniser"
    - Chasser/traquer animaux → "chasser"
    - Recruter/enrôler/mobiliser → "recruter"
    - Décret/loi/règle interne → "loi"
    - Attaquer/envahir/raider → "attaquer"
    - Diplomatie/paix/traité → "diplomatie"

  ÉTAPE 2 — Si l'action transforme des matériaux en produit :
    → invente un type en snake_case (ex: fabriquer_amphores)
    → remplis OBLIGATOIREMENT ressource_entree ET ressource_sortie
    → ces actions déclenchent une clarification si les champs manquent

  ÉTAPE 3 — Seulement si aucune des deux étapes ne s'applique
    (prière, méditation, divination, rituel, délibération interne...) :
    → invente un type en snake_case
    → laisse ressource_entree et ressource_sortie à null
    → ces actions n'ont pas d'effet mécanique sur les ressources

Extrais UNIQUEMENT ce JSON, rien d'autre :

{
  "actions": [
    {
      "type": "string",
      "cible": "string ou null",
      "quantite": "int ou null",
      "direction": "string ou null (nord/sud/est/ouest/...)",
      "ressource_entree": "string ou null",
      "ressource_sortie": "string ou null",
      "nb_personnes": "int ou null",
      "description_brute": "phrase exacte ou paraphrase courte tirée du texte",
      "confiance": 0.0 à 1.0
    }
  ],
  "etat_psychologique": "max 15 mots — état émotionnel de la civ ce mois",
  "memoire_a_conserver": "max 20 mots — ce que la civ veut retenir de ce tick"
}`;

/**
 * Logique d'appel
 */
async function parseCivNarrative(texte, provider, config = {}) {
  // Appeler le LLM : règles en system, texte narratif en user
  let rawResponse;
  try {
    const model = config.model || null;
    const stream = config.stream || false;
    const options = config.options || { temperature: 0.3, num_predict: 800 };
    const messages = [
      { role: 'system', content: PARSER_SYSTEM },
      { role: 'user', content: texte }
    ];
    const response = await provider({ model, messages, stream, options });
    rawResponse = response.message?.content || response.content || '';
  } catch (err) {
    console.error('[PARSER] Erreur lors de l\'appel LLM:', err.message);
    return {
      actions: [],
      etat_psychologique: 'inconnu',
      memoire_a_conserver: ''
    };
  }

  // Extraire le JSON de la réponse (peut contenir du texte autour)
  let parsed;
  let rawJson = '';
  try {
    const cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Aucun JSON trouvé');
    rawJson = jsonMatch[0];
    parsed = JSON.parse(rawJson);
  } catch (e) {
    console.warn('[PARSER_WARN] Impossible de parser la réponse LLM:', e.message);
    console.warn('[PARSER_WARN] Réponse brute:', rawResponse.slice(0, 500));
    // Tentative de réparation par troncature
    if (rawJson) {
      const lastBrace = rawJson.lastIndexOf('}');
      if (lastBrace > 0) {
        const truncated = rawJson.slice(0, lastBrace + 1) + ']}';  // fermer le tableau actions + l'objet racine
        try {
          parsed = JSON.parse(truncated);
        } catch (e2) {
          // échec de la réparation
        }
      }
    }
    if (!parsed) {
      return {
        actions: [],
        etat_psychologique: 'inconnu',
        memoire_a_conserver: ''
      };
    }
  }

  // Valider la structure
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const etat_psychologique = typeof parsed.etat_psychologique === 'string' ? parsed.etat_psychologique.trim() : '';
  const memoire_a_conserver = typeof parsed.memoire_a_conserver === 'string' ? parsed.memoire_a_conserver.trim() : '';

  // Normaliser les nouveaux champs
  actions.forEach(action => {
    action.ressource_entree = action.ressource_entree ?? null;
    action.ressource_sortie = action.ressource_sortie ?? null;
    action.nb_personnes = action.nb_personnes ?? null;
  });

  // Fonction de clarification des actions ambiguës
  async function clarifyAmbiguousAction(action, provider, config) {
    const question = `Pour l'action '${action.description_brute}' : quelle ressource est utilisée ? quelle ressource est produite ? combien d'unités ? combien de personnes ?`;
    let rawResponse;
    try {
      const model = config.model || null;
      const stream = config.stream || false;
      const options = config.options || { temperature: 0.3, num_predict: 800 };
      const messages = [
        { role: 'user', content: question }
      ];
      const response = await provider({ model, messages, stream, options });
      rawResponse = response.message?.content || response.content || '';
    } catch (err) {
      console.error('[PARSER] Erreur lors du second appel LLM:', err.message);
      return;
    }
    const line = rawResponse.trim().split('\n')[0]; // première ligne
    console.warn(`[PARSER_CLARIFY] Réponse reçue: ${line}`);
    // Tentative d'extraction (simplifiée)
    // Pour l'instant, on applique les défauts
    // Extraire la première ressource citée dans la description
    function extractFirstResource(desc) {
      const resources = ['bois', 'pierre', 'nourriture', 'or', 'fer', 'cuir', 'eau', 'minerai', 'plante', 'viande', 'poisson', 'laine', 'tissu', 'argile', 'brique', 'charbon', 'pétrole', 'électricité', 'magie'];
      const lower = desc.toLowerCase();
      for (const res of resources) {
        if (lower.includes(res)) {
          return res;
        }
      }
      return null;
    }
    action.ressource_entree = action.ressource_entree ?? extractFirstResource(action.description_brute) ?? null;
    action.ressource_sortie = action.ressource_sortie ?? action.cible ?? null;
    action.quantite = action.quantite ?? 1;
    action.nb_personnes = action.nb_personnes ?? 5;
  }

  // Fonction de détection de matériaux
  function containsMaterialWord(description) {
    const materialWords = ['glaise', 'bois', 'pierre', 'métal', 'tissu', 'laine', 'cuir', 'os', 'silex', 'argile', 'sable', 'sel', 'minerai'];
    const lower = description.toLowerCase();
    return materialWords.some(word => lower.includes(word));
  }

  // Logger les actions avec confiance < 0.4
  actions.forEach(action => {
    if (action.confiance < 0.4) {
      console.warn(`[PARSER_WARN] Action à faible confiance (${action.confiance}): ${action.type} - ${action.description_brute}`);
    }
  });

  // Logger les types inconnus (non dans la liste)
  const knownTypes = [
    'affecter', 'construire', 'explorer', 'coloniser', 'attaquer',
    'diplomatie', 'envoyer_emissaire', 'envoyer_marchands', 'espionner',
    'loi', 'recruter', 'abandonner', 'chasser', 'utiliser_relique', 'etudier_relique'
  ];
  actions.forEach(action => {
    if (!knownTypes.includes(action.type)) {
      console.warn(`[PARSER_NEW_TYPE] Type inconnu: ${action.type} (${action.description_brute})`);
    }
  });

  // Détection des actions ambiguës et second appel LLM si nécessaire
  for (const action of actions) {
    if (!knownTypes.includes(action.type) &&
        action.ressource_entree === null &&
        action.ressource_sortie === null &&
        containsMaterialWord(action.description_brute)) {
      console.warn(`[PARSER_AMBIGUOUS] Action ambiguë détectée: ${action.type} - ${action.description_brute}`);
      await clarifyAmbiguousAction(action, provider, config);
    }
  }

  return {
    actions,
    etat_psychologique,
    memoire_a_conserver
  };
}

module.exports = { parseCivNarrative };