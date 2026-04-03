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

Si l'action ne correspond à aucun type connu :
→ invente un type en snake_case qui décrit fidèlement l'intention
→ exemples : meditation_collective, rituel_fondation,
             migration_vers_nord, cartographie_des_etoiles,
             negociation_commerciale, alliance_matrimoniale

Extrais UNIQUEMENT ce JSON, rien d'autre :

{
  "actions": [
    {
      "type": "string",
      "cible": "string ou null",
      "quantite": "int ou null",
      "direction": "string ou null (nord/sud/est/ouest/...)",
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
    const options = config.options || { temperature: 0.2, num_predict: 800 };
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
  try {
    const cleaned = rawResponse.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Aucun JSON trouvé');
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.warn('[PARSER_WARN] Impossible de parser la réponse LLM:', e.message);
    console.warn('[PARSER_WARN] Réponse brute:', rawResponse.slice(0, 500));
    return {
      actions: [],
      etat_psychologique: 'inconnu',
      memoire_a_conserver: ''
    };
  }

  // Valider la structure
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  const etat_psychologique = typeof parsed.etat_psychologique === 'string' ? parsed.etat_psychologique.trim() : '';
  const memoire_a_conserver = typeof parsed.memoire_a_conserver === 'string' ? parsed.memoire_a_conserver.trim() : '';

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

  return {
    actions,
    etat_psychologique,
    memoire_a_conserver
  };
}

module.exports = { parseCivNarrative };