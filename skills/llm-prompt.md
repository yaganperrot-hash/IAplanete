# llm-prompt.md — Architecture du prompt LLM (V4)

## Fichier actif
`backend/src/llm/civOllamaLLM.js`

## Philosophie
Le prompt décrit la réalité, ne donne pas d'ordres. L'IA décide librement.
Pas de chiffres bruts — descriptions narratives qualitatives.

---

## Structure du prompt (buildPrompt)

### Couche 1 — QUI TU ES (fixe par civ)

#### getRoleIntro(ctx) — V4 patch gouvernement
Rôle adapté au gouvernement via `getRoleIntro(ctx)` :
```
monarchie/royaume  → "Tu es le Roi de [nom]."
aristocratie       → "Tu es le Conseil des Nobles de [nom]."
théocratie         → "Tu es le Grand Prêtre de [nom]."
tribu/tribal       → "Tu es le Chef de la tribu [nom]."
république         → "Tu es le Sénat de [nom]."
démocratie         → "Tu es l'Assemblée du peuple de [nom]."
(défaut)           → "Tu es le dirigeant de [nom]."
```
Phrase d'ancrage universelle (sans mention de "jeu") :
> *"Ton peuple est réel. Ses souffrances, ses espoirs, ses décisions t'appartiennent. Tu n'as pas à gagner — tu as à exister."*

Valeurs fondamentales : [valeurs].
Gouvernement : [gouvernement].

### Couche 2 — CE QUE TU PERÇOIS (narratif, change chaque tick)

#### describeSeason(ctx)
```
SAISON : [Mois], An [X] ([saison]).
[SEASON_DESC[saison]] [SEASON_HINT[saison]]
```
- Hiver : alerte logement/bois
- Automne : incitation au stockage

#### structNote — V4 patch rôles
Chaque bâtiment affiché avec `[rôle, cap:N]` + workers actifs.
Note chantiers active : "⚠️ Tu as déjà N chantiers actifs — tu NE PEUX PAS lancer d'autres constructions" si ≥ 2 en cours.

#### getTextePopulation(ctx) — V4 patch sans-abri
- **En tête (priorité absolue)** : si `homelessDeaths > 0` → "⚠️ URGENCE : X morts de froid ce mois-ci"
- Si `homeless > 0` → "X personnes (Y%) dorment dehors. Construire une Habitation (rôle: habitation) est une question de survie."
- Effectifs libres + tendance démographique + répartition travailleurs

#### getTexteRessources(ctx) — V4 patch ressources à 0 + chargement conditionnel
- **Bois, pierre, glaise toujours affichés** même si stock = 0 ("pierre : aucun stock")
- Minéraux (cuivre/fer/or/charbon/etain/sel/sable) : affichés **seulement si stock > 0**
- Ressources animales (peaux/os) : affichées **seulement si stock > 0**
- Alerte nourriture : "FAMINE dans N ticks !"
- Alerte bois automne/hiver : si bois < pop×2

#### describeTerritory(ctx)
- Total / construit / libre
- Biomes détaillés (top 5)
- Alerte si territoire saturé

#### describeStructures(ctx)
- Liste des bâtiments avec workers et production/tick
- **"NE PAS RECONSTRUIRE L'EXISTANT"** (évite les répétitions)
- Résumé par rôle

#### describeNeighbors(ctx)
- Aucun → "L'inconnu s'étend dans toutes les directions"
- Connus → nom + relation + force militaire

#### describeMood(ctx)
- Moral X/100 (label)
- ✅ satisfactions / ⚠️ frustrations (avec tick cumulatif)
- Alerte révolte si moral < 30

#### describeConsequences(ctx)
- `last_consequences` : événements du tick précédent

#### describeKnowledge(ctx)
- Noms uniques des structures existantes

### Couche 3 — QUESTION OUVERTE (buildDynamicQuestion)
Priorité des tensions :
1. Sans-abri en automne/hiver
2. Manque de bois en hiver
3. Famine imminente (< 5 ticks)
4. Frustrations de valeurs
5. Surpeuplement
6. Silex > 80 → *"Tes stocks de silex s'accumulent. Qu'en fait ton peuple ?"*
7. Glaise > 80 → *"La glaise s'entasse dans tes entrepôts. Qu'en décides-tu ?"*
   (si les deux > 80, question sur celui au stock le plus élevé uniquement)
→ `buildDynamicQuestion(ctx)` — les urgences vitales priment toujours

---

## Format de réponse attendu
```
STRATÉGIE : [texte libre — 1-2 phrases]

EFFETS :
- AFFECTER [X] personnes → [tâche]
- CRÉER [nom] (rôle: [...], capacité: [X], personnes: [X], durée: [X mois])
- ENVOYER [X] personnes → [destination] (but: explorer/coloniser/mission)
- MODIFIER [bâtiment] → [changement]
- ABANDONNER [bâtiment]
- ESPIONNER [civ] (personnes: [X])
- ENVOYER_EMISSAIRE [civ] (personnes: [X])
- ENVOYER_MARCHANDS [civ] (personnes: [X], offre: [res], demande: [res])
- DIPLOMATIE [action] → [civ]
- LOI [description]
- RIEN
```

## Parsing (parseResponse)
1. Extrait `STRATÉGIE :` → première ligne si absent
2. Extrait section `EFFETS` → lignes commençant par `-`
3. Actions = premier mot de chaque ligne (`AFFECTER`, `CRÉER`, etc.)
4. Fallback : `RIEN` si parsing échoue

---

## Paramètres Ollama
```js
model: process.env.OLLAMA_MODEL || 'mistral-nemo'
temperature: 0.8
num_predict: 1200
timeout: 60000ms
```
Fallback automatique → `civMockLLM.js` si Ollama unavailable ou timeout.

---

## Sections conditionnelles (chargement sélectif)

| Section | Condition d'inclusion |
|---|---|
| Animaux | `animal_groups.length > 0` |
| Reliques | `reliques_decouvertes.length > 0` |
| Voisins détaillés | `neighbors.length > 0` |
| Minéraux | au moins 1 minéral > 0 |
| Ressources animales | peaux ou os > 0 |
| Frustrations | au moins 1 frustration_tick > 0 |
| Processus en cours | `active_processes.length > 0` |

Objectif : ~1200 tokens en An 1, grossit naturellement avec les découvertes.

---

## Variants de prompt (civPromptVariants.js)

Chaque civilisation a un `prompt_variant` (V0–V9) stocké en DB.
`buildPrompt(ctx)` sélectionne le builder selon `ctx.prompt_variant` :
- `V0` : baseline (`buildPromptV0`) — prompt V4 complet dans chaque LLM file
- `V1` : Minimal — état factuel condensé, 1 page
- `V2` : Psychologique — trauma/mémoire/mystère/tension latente
- `V3` : Corps — faits bruts "dans les corps du peuple"
- `V4` : Urgence pure — liste de ce qui ne va pas
- `V5` : Géopolitique — focus relations extérieures
- `V6` : Économique — bilan détaillé ressources/production
- `V7` : Chronique — narration annalistique
- `V8` : Valeurs-Tension — état de chaque valeur (satisfaite/frustrée)
- `V9` : Oracle — lecture oraculaire des signes

Architecture :
```js
// civGeminiLLM.js / civOllamaLLM.js
const { buildVariantBody } = require('./civPromptVariants');
function buildPromptV0(ctx) { /* prompt baseline complet */ }
function buildPrompt(ctx) {
  const variant = ctx.prompt_variant || 'V0';
  if (variant === 'V0') return buildPromptV0(ctx);
  return buildVariantBody(ctx, variant) + '\n\n' + FORMAT_*;
}
```

`prompt_variant` injecté dans `buildCivContext()` via `civActionResolver.js`.

---

## Snapshots (`civ_snapshots`)

Pris toutes les `SNAPSHOT_INTERVAL_TICKS` ticks (défaut 20) après la boucle LLM.
Colonnes : `world_id, civ_id, prompt_variant, tick, population, moral, food_stock, army_soldiers, territory_count, buildings_count, nb_wars, nb_alliances, frustration_max`.

Analyse : `node backend/scripts/analyzeVariants.js`

---

## Condition d'appel LLM (civEngine.js)
L'appel LLM est déclenché si **au moins une** condition est vraie :
- `isIdle` : 0 processus en cours
- `isFamine` : nourriture ≤ 0
- `isUnderAttack` : relation = 'guerre' en DB
- `hasAnimalAttack` : `last_consequences` contient `type: 'attaque_animaux'`
- `hasNoHousing && saison ∈ [automne, hiver]`
- `foodSurplus < 0` : production < consommation
- `hasRelicDiscovered`, `hasFirstContact`

Sinon : skip (économie de tokens).
