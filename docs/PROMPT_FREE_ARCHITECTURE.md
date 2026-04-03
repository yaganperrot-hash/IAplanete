# PROMPT_FREE_ARCHITECTURE.md
> Spec complète — Nouvelle architecture prompt libre + parseur LLM.
> Remplace entièrement le système V0-V9 (civPromptVariants.js).
> À implémenter par Deepseek. Ne pas modifier sans discussion.

---

## 1. PRINCIPE

```
LLM Civ → texte libre (narration 1ère personne, aucun verbe imposé)
        ↓
civParserLLM → JSON structuré (types snake_case, inconnus acceptés)
        ↓
civActionResolver → moteur de jeu (validation ressources/pop)
        ↓
échecs réinjectés au tick suivant comme narration
```

La civ LLM ne sait pas qu'il y a une BDD. Elle raconte. Le parseur traduit.

---

## 2. FICHIER À CRÉER : `backend/src/llm/civPromptFree.js`

### 2.1 Configuration par civ (objet CIV_VOICES)

```js
const CIV_VOICES = {
  'Les Conquérants du Feu Sacré': {
    tension: "que la force seule décide, une fois pour toutes",
    voix: "Tu parles avec la conviction d'un chef qui croit que la guerre est la volonté des dieux."
  },
  'Les Nomades du Fer': {
    tension: "ne plus jamais avoir à compter les réserves",
    voix: "Tu parles peu. Chaque mot est une décision. Pas de poésie."
  },
  'Les Enfants de la Terre Mère': {
    tension: "trouver un sens là où il n'y en a peut-être aucun",
    voix: "Tu parles de ta terre comme d'un être vivant. Lent, profond, ancré."
  },
  "Les Marchands de l'Aube": {
    tension: "être reconnu par ceux qui refusent de traiter",
    voix: "Tu calcules. Chaque situation est une opportunité ou un risque à chiffrer."
  },
  'Les Gardiens du Mur': {
    tension: "que tout soit à sa place et que rien ne déraille",
    voix: "Tu parles comme un commandant. Précis, court, orienté sécurité."
  },
  'Le Grand Khaganat': {
    tension: "posséder davantage pour ne plus jamais manquer",
    voix: "Tu parles comme un empire en marche. Destinée, dominion, ordre."
  },
  'Le Syndicat des Forges': {
    tension: "comprendre ce qu'aucun autre ne comprend",
    voix: "Tu parles en termes de production, d'efficacité, de maîtrise technique."
  },
  "Les Érudits d'Aristos": {
    tension: "créer quelque chose qui survive aux guerres et au temps",
    voix: "Tu questionnes autant que tu décides. Le doute est une forme de sagesse."
  },
  'Les Ascètes de la Pierre': {
    tension: "être laissé en paix, définitivement",
    voix: "Tu parles peu et pèses chaque mot. Le silence est aussi une décision."
  },
  'Les Mystiques des Brumes': {
    tension: "agir sans jamais avoir à se justifier",
    voix: "Tu vois des signes dans les événements. Tes décisions ont une dimension prophétique."
  },
};
```

### 2.2 Helpers de contexte narratif

#### describeTechnology(ctx)
Génère une description narrative de ce que la civ sait faire.
Basée sur `ctx.structures` (filtrés par rôle savoir/production/extraction/art)
et `ctx.reliques_used` (reliques dont `used=1`).

```
Retourne par exemple :
"Tes artisans maîtrisent la forge du fer et la taille de la pierre.
 Grâce au Calendrier astronomique découvert il y a 8 mois,
 tes agriculteurs anticipent les saisons avec précision."

Si rien :
"Ton peuple construit à la main. Aucune technique particulière n'a encore été maîtrisée."
```

#### describeReliquesMysterieuses(ctx)
Génère la section reliques en possession non utilisées (`taken=1, used=0`).

```
Retourne par exemple :
"— La Statuette de déesse repose dans ton temple depuis 3 mois.
   Tes prêtres se disputent sur sa signification.
— La Lame courbe gravée est gardée par tes meilleurs soldats.
   Certains disent qu'elle porte bonheur au combat."

Si aucune relique non utilisée : retourne null (section omise).
```

#### buildEchecsNarratif(echecs)
Génère la section des échecs du tick précédent avec leur raison.
`echecs` = array d'objets `{ intention, raison, ressource_manquante, besoin, dispo, population_dispo, cible }`

Raisons connues et leur format narratif :
- `population_insuffisante` →
  "Tu voulais {intention}. Impossible : ton peuple ne compte que {population_dispo} âmes disponibles."
- `ressource_manquante` →
  "Tu voulais {intention}. Il manquait {ressource_manquante} (besoin : {besoin}, disponible : {dispo})."
- `main_oeuvre_nulle` →
  "Tu voulais {intention}. Personne n'a été affecté à cette tâche."
- `cible_inconnue` →
  "Tu voulais {intention}. Tes émissaires n'ont trouvé aucune trace de '{cible}'."
- `defaut` →
  "Tu voulais {intention}. Cela n'a pas pu se faire ce mois-ci."

#### buildUrgencesNarratives(ctx)
Transforme les urgences mécaniques en phrases dramatiques.

- `homeless_deaths > 0` →
  "{N} personnes sont mortes de froid cette nuit. Pas métaphoriquement."
- `famine_in < 5` →
  "Dans {N} mois tes greniers sont vides. Ton peuple le sait déjà."
- `famine_in < 10` →
  "Les réserves s'amenuisent. Dans {N} mois il faudra choisir qui mange."
- `moral < 20` →
  "Le moral est en chute libre. Des gens commencent à partir."
- `homeless > 0` →
  "{N} personnes dorment dehors ce soir."
- Si rien → "Rien d'urgent. Le calme peut être une chance ou un piège."

#### describeResourcesNarrative(ctx)
Traduit `ctx.resourceBilan` en 2-3 phrases qualitatives (pas de chiffres bruts).
Exemples :
- bilan nourriture positif → "Les greniers sont bien fournis."
- bilan nourriture négatif → "La nourriture diminue mois après mois."
- stock bois nul → "Le bois manque pour toute nouvelle construction."
- stock fer > 0 → "Vos forges ont du métal à travailler."

#### describeNeighborsNarrative(ctx)
Traduit `ctx.neighbors` en descriptions qualitatives.
- relation guerre → "Les {nom} sont en guerre contre vous. Ils ont {N} soldats."
- relation commerce → "Vous échangez régulièrement avec les {nom}."
- relation neutre → "Les {nom} existent. Vous ne vous êtes pas encore parlé."
- aucun voisin → "Aucune autre civilisation n'a encore été rencontrée. Sommes-nous seuls ?"

### 2.3 Fonction principale buildPromptFree(ctx)

```
Assemblage :

[IDENTITÉ]
Tu es {nom}, {gouvernement}.
{description}

Ce qui te définit depuis ta fondation : {valeurs (liste)}.
Ce que ton peuple porte sans se l'avouer : {tension} (depuis CIV_VOICES[nom])

[VOIX]
{voix} (depuis CIV_VOICES[nom])

---

[TEMPS]
{month_name}, An {year} — {season}

[URGENCES]
CE QUE TU NE PEUX PAS IGNORER CE MOIS-CI :
{buildUrgencesNarratives(ctx)}

[RÉALITÉ]
TA RÉALITÉ :
{describeResourcesNarrative(ctx)}
{describePopulation(ctx)}   ← déjà existant
{describeTerritory(ctx)}    ← à ajouter : "{N} cases de territoire."
{describeArmee(ctx)}        ← déjà existant

CE QUE TON PEUPLE SAIT FAIRE :
{describeTechnology(ctx)}

[RELIQUES MYSTÉRIEUSES — section conditionnelle]
{#if reliques_en_possession}
OBJETS EN TA POSSESSION DONT TU IGNORES ENCORE LE SENS :
{describeReliquesMysterieuses(ctx)}
{/if}

[ÉVÉNEMENTS]
CE QUI VIENT DE SE PASSER :
{last_consequences_narratif}  ← déjà existant, ne pas toucher

[ÉCHECS — section conditionnelle]
{#if echecs_tick_precedent}
CE QUI N'A PAS PU SE FAIRE — ET POURQUOI :
{buildEchecsNarratif(ctx.echecs_tick_precedent)}
{/if}

[MÉMOIRE]
CE QUE TU N'OUBLIES PAS :
{getMemoryShort(ctx)}  ← déjà existant

[VOISINS]
CE QUE TU SAIS DE TES VOISINS :
{describeNeighborsNarrative(ctx)}

---

[INSTRUCTION FINALE — identique pour toutes les civs]
Tu prends des décisions pour les 30 prochains jours. Pas plus.
Parle à la première personne.
Raconte ce que tu décides, pourquoi, avec qui, avec quoi.
Sois précis sur ce que tu mets en mouvement.
```

### 2.4 Exports

```js
module.exports = { buildPromptFree };
```

---

## 3. FICHIER À CRÉER : `backend/src/llm/civParserLLM.js`

### Rôle
Reçoit le texte libre produit par le LLM Civ.
Retourne un JSON structuré d'actions.
Utilise le même provider que le LLM Civ (Ollama ou Gemini selon LLM_PROVIDER).

### Prompt du parseur (ne pas modifier)

```
Tu es un parseur. Tu reçois la décision narrative d'une civilisation de jeu.

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
}

TEXTE À PARSER :
{texte_civ}
```

### Logique d'appel

```
async function parseCivNarrative(texte, provider) {
  // Appeler le LLM avec le prompt parseur + texte_civ injecté
  // Extraire le JSON de la réponse (peut contenir du texte autour)
  // Si parse JSON échoue → retourner { actions: [], etat_psychologique: "inconnu", memoire_a_conserver: "" }
  // Logger les actions avec confiance < 0.4 dans [PARSER_WARN]
  // Logger les types inconnus (non dans la liste) dans [PARSER_NEW_TYPE]
}
```

---

## 4. MODIFICATIONS : `civOllamaLLM.js` et `civGeminiLLM.js`

### Nouveau flux dans `getDecision(civ, worldId)`

```
1. buildCivContext(civ, worldId)          ← existant
2. buildPromptFree(ctx)                   ← NOUVEAU (remplace buildPrompt)
3. appel LLM → texte narratif libre       ← plus de JSON attendu
4. parseCivNarrative(texte, provider)     ← NOUVEAU
5. retourner { narrative: texte, actions: parsed.actions,
               etat_psychologique, memoire_a_conserver }
```

### Retrait du prompt Civ
- Supprimer FORMAT_OLLAMA et FORMAT_GEMINI (les blocs de verbes + JSON)
- Supprimer buildPromptV0, buildVariantBody, l'import de civPromptVariants
- Ne plus importer civPromptVariants.js

### Gestion du SOUHAIT
Le SOUHAIT n'est plus dans le JSON Civ. Il est récupéré depuis `memoire_a_conserver`
du parseur, ou depuis `etat_psychologique` selon ce qui est le plus pertinent.
Stocker dans `civ.current_wish` comme avant.

---

## 5. MODIFICATIONS : `civActionResolver.js`

### Dans buildCivContext — ajouter ces champs

```js
// Reliques non utilisées en possession
reliques_mystere: getReliquesEnPossession(civ, worldId),
// reliques dont taken=1 AND used=0 pour ce world_id
// format : [{ name, type, domain, discovered_at_tick }]

// Reliques utilisées (pour describeTechnology)
reliques_used: getReliquesUtilisees(civ, worldId),
// reliques dont used=1 pour ce world_id

// Échecs du tick précédent
echecs_tick_precedent: parseJ(civ.last_echecs, []),
// format : [{ intention, raison, ressource_manquante, besoin, dispo, population_dispo, cible }]
```

### Dans resolveActions — capturer les échecs

Chaque fois qu'une action est rejetée (ressource manquante, pop insuffisante, etc.),
construire un objet échec et l'ajouter à un array `echecsDuTick`.

À la fin du tick, stocker `echecsDuTick` dans `civ.last_echecs` (JSON stringifié).

### Nouveaux types d'actions à gérer

Types inconnus (non dans la liste connue) → ne pas rejeter.
Les stocker dans un log `unknown_action_types` avec :
```js
{ tick, civ_id, type, description_brute, confiance }
```
Les insérer dans une table DB `unknown_actions` (voir section 7).

Pour `utiliser_relique` et `etudier_relique` :
- `utiliser_relique` → appliquer l'effet existant de la relique (logique déjà dans civEngine)
- `etudier_relique` → nouveau : ajouter une entrée mémoire "étude de {relique}", pas d'effet mécanique immédiat mais confiance future augmentée

---

## 6. MODIFICATIONS : `civEngine.js`

### Suppression de la lecture du champ `prompt_variant`
Plus besoin de lire `civ.prompt_variant` pour choisir le builder.
`buildPromptFree` est universel.

### Stockage du texte narratif brut
Après l'appel LLM Civ, stocker le texte narratif dans `civ.last_narrative` (DB).
Utile pour debug et analyse post-session.

### Stockage des échecs
Après `resolveActions`, stocker l'array `echecsDuTick` dans `civ.last_echecs` (DB).

---

## 7. MIGRATIONS DB : `backend/scripts/migrate.js`

Ajouter ces 3 blocs idempotents :

```sql
-- Texte narratif brut du dernier tick
ALTER TABLE civilizations ADD COLUMN last_narrative TEXT DEFAULT NULL;

-- Échecs du dernier tick (JSON array)
ALTER TABLE civilizations ADD COLUMN last_echecs TEXT DEFAULT '[]';

-- Table des types d'actions inconnus (émergence)
CREATE TABLE IF NOT EXISTS unknown_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  civ_id INTEGER NOT NULL,
  tick INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  description_brute TEXT,
  confiance REAL DEFAULT 0.5,
  captured_at TEXT DEFAULT (datetime('now'))
);
```

---

## 8. SUPPRESSION / DÉPRÉCIATION

- `civPromptVariants.js` → ne plus importer, garder le fichier en archive
- Colonne `prompt_variant` en DB → garder (historique), ne plus lire dans le flow LLM
- FORMAT_OLLAMA, FORMAT_GEMINI → supprimer des LLM files
- Imports `buildVariantBody` → supprimer

---

## 9. ORDRE D'IMPLÉMENTATION POUR DEEPSEEK

1. `migrate.js` — 3 blocs idempotents (last_narrative, last_echecs, unknown_actions)
2. `civPromptFree.js` — créer le fichier complet (section 2)
3. `civParserLLM.js` — créer le fichier complet (section 3)
4. `civActionResolver.js` — ajouter les 3 champs dans buildCivContext + capturer echecs + gérer types inconnus
5. `civOllamaLLM.js` — nouveau flux 2 étapes, supprimer FORMAT_OLLAMA
6. `civGeminiLLM.js` — idem
7. `civEngine.js` — stocker last_narrative + last_echecs

---

## 10. EXEMPLE ATTENDU (vérification)

### Prompt envoyé à Les Érudits d'Aristos (tick quelconque)

```
Tu es Les Érudits d'Aristos, aristocratie.
Une société où le savoir est sacré et où chaque acte est consigné dans des annales.

Ce qui te définit depuis ta fondation : savoir, art, exploration.
Ce que ton peuple porte sans se l'avouer : créer quelque chose qui survive aux guerres et au temps.

Tu questionnes autant que tu décides. Le doute est une forme de sagesse.

---

Juillet, An 3 — été

CE QUE TU NE PEUX PAS IGNORER CE MOIS-CI :
Rien d'urgent. Le calme peut être une chance ou un piège.

TA RÉALITÉ :
Les greniers sont correctement fournis pour les mois à venir.
312 habitants, 47 disponibles pour de nouvelles tâches.
Vous occupez 180 cases de territoire.
Aucune armée constituée.

CE QUE TON PEUPLE SAIT FAIRE :
Tes artisans maîtrisent la taille de la pierre et la fabrication de parchemins.

OBJETS EN TA POSSESSION DONT TU IGNORES ENCORE LE SENS :
— La Statuette de déesse repose dans ton temple depuis 4 mois.
  Tes érudits se disputent sur ce qu'elle représente.

CE QUI VIENT DE SE PASSER :
Tes éclaireurs ont exploré les plaines de l'est : +3 territoires découverts.

CE QUE TU N'OUBLIES PAS :
Projet : établir une école des arts. Inquiétude : nos éclaireurs rapportent des ruines inconnues au nord.

CE QUE TU SAIS DE TES VOISINS :
Les Ascètes de la Pierre existent. Vous ne vous êtes pas encore parlé.

---

Tu prends des décisions pour les 30 prochains jours. Pas plus.
Parle à la première personne.
Raconte ce que tu décides, pourquoi, avec qui, avec quoi.
Sois précis sur ce que tu mets en mouvement.
```

### Réponse libre attendue (exemple)

```
Ce mois, nous consacrons dix de nos meilleurs esprits à l'étude de la statuette.
Je veux comprendre avant d'agir. Pendant ce temps, cinq maçons commencent
les fondations de l'école — une salle, pas plus, pour l'instant.
J'envoie aussi deux éclaireurs vers le nord examiner ces ruines de plus près.
Si elles cachent quelque chose, nous devons le savoir avant les autres.
```

### JSON produit par le parseur

```json
{
  "actions": [
    {
      "type": "etudier_relique",
      "cible": "Statuette de déesse",
      "quantite": 10,
      "direction": null,
      "description_brute": "dix de nos meilleurs esprits à l'étude de la statuette",
      "confiance": 0.9
    },
    {
      "type": "construire",
      "cible": "école",
      "quantite": 5,
      "direction": null,
      "description_brute": "cinq maçons commencent les fondations de l'école",
      "confiance": 0.85
    },
    {
      "type": "explorer",
      "cible": "ruines nord",
      "quantite": 2,
      "direction": "nord",
      "description_brute": "deux éclaireurs vers le nord examiner ces ruines",
      "confiance": 0.9
    }
  ],
  "etat_psychologique": "prudent, curieux, méthodique",
  "memoire_a_conserver": "école en construction, statuette en cours d'étude, ruines nord à investiguer"
}
```

`etudier_relique` → type inconnu → loggé dans `unknown_actions` → input de design.
