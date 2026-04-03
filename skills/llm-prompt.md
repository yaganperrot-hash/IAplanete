# llm-prompt.md — Architecture du prompt LLM (Prompt-Free)

## Fichiers actifs
- `backend/src/llm/civPromptFree.js` — prompt narratif universel
- `backend/src/llm/civParserLLM.js` — parseur LLM (2e appel)
- `backend/src/llm/civOllamaLLM.js` — provider Ollama
- `backend/src/llm/civGeminiLLM.js` — provider Gemini

## Flux complet
```
buildCivContext(civ, worldId)       ← civActionResolver.js
  ↓
buildPromptFree(ctx)                ← civPromptFree.js
  ↓
Appel LLM Civ → texte narratif libre (1ère personne, aucun verbe imposé)
  ↓
parseCivNarrative(texte, provider)  ← civParserLLM.js (2e appel LLM)
  ↓
{ actions[], etat_psychologique, memoire_a_conserver }
  ↓
civActionResolver → moteur de jeu
```

## civPromptFree.js — Structure du prompt

### Sections assemblées par buildPromptFree(ctx)

```
[IDENTITÉ]
Tu es {nom}, {gouvernement}.
{description}
Ce qui te définit : {valeurs}
Ce que ton peuple porte sans se l'avouer : {tension} (CIV_VOICES[nom])

[VOIX]
{voix} (CIV_VOICES[nom])

---

[TEMPS]
{month_name}, An {year} — {season}

[URGENCES]
CE QUE TU NE PEUX PAS IGNORER CE MOIS-CI :
{buildUrgencesNarratives(ctx)}

[RÉALITÉ]
{describeResourcesNarrative(ctx)}   ← qualitatif, pas de chiffres bruts
{describePopulation(ctx)}
{describeTerritory(ctx)}
{describeArmee(ctx)}

CE QUE TON PEUPLE SAIT FAIRE :
{describeTechnology(ctx)}

[RELIQUES MYSTÉRIEUSES — conditionnel si taken=1 AND used=0]
{describeReliquesMysterieuses(ctx)}

[ÉVÉNEMENTS]
{last_consequences_narratif}

[ÉCHECS — conditionnel si echecs_tick_precedent non vide]
{buildEchecsNarratif(echecs_tick_precedent)}

[MÉMOIRE]
{getMemoryShort(ctx)}

[VOISINS]
{describeNeighborsNarrative(ctx)}

---

[INSTRUCTION FINALE]
Tu prends des décisions pour les 30 prochains jours. Pas plus.
Parle à la première personne. Raconte ce que tu décides, pourquoi, avec qui, avec quoi.
```

### CIV_VOICES (par nom de civ)
Chaque civ a une `tension` (désir inavoué) et une `voix` (style narratif).
10 civs actives : Conquérants, Gardiens, Khaganat, Ascètes, Mystiques, Marchands de la Route d'Or, Cité des Sages, Chasseurs du Vent, Empire des Forges, Pillards de la Côte.

### Helpers narratifs
| Fonction | Rôle |
|---|---|
| `buildUrgencesNarratives(ctx)` | Morts de froid, famine, moral < 20, sans-abri |
| `describeResourcesNarrative(ctx)` | 2-3 phrases qualitatives, pas de chiffres |
| `describeTechnology(ctx)` | Ce que la civ sait faire (structures + reliques used) |
| `describeReliquesMysterieuses(ctx)` | Reliques taken=1 AND used=0 |
| `buildEchecsNarratif(echecs)` | Traduction des échecs en phrases dramatiques |
| `describeNeighborsNarrative(ctx)` | Voisins en qualitatif (guerre/commerce/neutre) |

**Bug connu corrigé** : `describeTechnology` ligne extraction — vérifier `s.role` avant `.includes()`.

---

## civParserLLM.js — Parseur

### Prompt parseur (ne pas modifier)
Reçoit le texte libre de la civ, retourne JSON structuré.
Règle : traduit fidèlement, n'invente pas, types inconnus → snake_case inventé.

### Types mécaniques connus
`affecter` `construire` `explorer` `coloniser` `attaquer` `diplomatie`
`envoyer_emissaire` `envoyer_marchands` `espionner` `loi` `recruter`
`abandonner` `chasser` `utiliser_relique` `etudier_relique`

### Retour
```js
{
  actions: [{ type, cible, quantite, direction, description_brute, confiance }],
  etat_psychologique: "max 15 mots",
  memoire_a_conserver: "max 20 mots"
}
```
- Confiance < 0.4 → log `[PARSER_WARN]`
- Type inconnu → log `[PARSER_NEW_TYPE]` + INSERT `unknown_actions`
- Parse échoue → `{ actions: [], etat_psychologique: 'inconnu', memoire_a_conserver: '' }`

---

## Paramètres Ollama
```
model: process.env.OLLAMA_MODEL || 'mistral-nemo'
temperature: 0.8
num_predict: 1200
timeout: 60000ms
```
Fallback → `civMockLLM.js` si Ollama unavailable ou timeout.

---

## Condition d'appel LLM (civEngine.js)
Déclenché si au moins une condition vraie :
- `isIdle` : 0 processus en cours
- `isFamine` : nourriture ≤ 0
- `isUnderAttack` : relation = 'guerre' en DB
- `hasAnimalAttack` : last_consequences contient `type: 'attaque_animaux'`
- `hasNoHousing` en automne/hiver
- `foodSurplus < 0`
- `hasRelicDiscovered`, `hasFirstContact`

---

## Colonnes DB liées
- `civilizations.last_narrative TEXT` — texte narratif brut du dernier tick
- `civilizations.last_echecs TEXT DEFAULT '[]'` — échecs du tick précédent
- `civ_snapshots` — snapshots toutes les SNAPSHOT_INTERVAL_TICKS ticks
- `unknown_actions` — types d'actions inventés par le parseur

## Fichiers obsolètes (garder en archive, ne plus importer)
- `civPromptVariants.js` — ancien système V0-V9
