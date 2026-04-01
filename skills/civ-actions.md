# civ-actions.md — Actions LLM et résolution (Civilisations V3)

## Fichier
`backend/src/simulation/civActionResolver.js` → `parseEffets()`, `resolveEffect()`

---

## Parsing (parseEffets)
Prend le bloc `EFFETS :` du texte LLM, extrait les lignes commençant par `-`.
Chaque ligne = un effet avec un verbe-clé.

Format d'une ligne :
```
- VERBE [paramètres libres...]
```

---

## Verbes reconnus

### AFFECTER
```
AFFECTER [X] personnes → [description de tâche]
AFFECTER [X] → [bâtiment] (workers)
AFFECTER [X] → armée
```
- Affecte N travailleurs à un bâtiment existant ou à l'armée
- Vérifie `freeLabor` disponible
- Met à jour `buildings[].workers` ou `army_soldiers`

### CRÉER
```
CRÉER [nom libre] (rôle: X, capacité: X, personnes: X, durée: X mois)
```
- Crée un processus `construction` dans `civ_processes`
- Workers réservés pendant la durée
- À la fin : bâtiment ajouté à `buildings[]` avec rôle/capacité propagés
- **Chaque CRÉER = case indépendante** — pas de fusion avec l'existant
- Coûts : `CREATION_COSTS[catégorie]` en ressources (bois + pierre etc.)
- **Carrière (rôle extraction) coûte bois uniquement** — pas de pierre requise (bootstrap possible depuis 0 pierre)
- Mines métalliques (mine_fer, mine_or, mine_cuivre...) gardent leur coût pierre

### ENVOYER
```
ENVOYER [X] personnes → [destination] (but: explorer/coloniser/mission)
```
- Crée processus `exploration` ou `mission`
- Workers partis = non disponibles pendant la durée
- Territoire ajouté à la fin si exploration réussie

### MODIFIER
```
MODIFIER [bâtiment existant] → [changement]
```
- Modifie un bâtiment existant (workers, rôle, capacité)

### ABANDONNER
```
ABANDONNER [bâtiment]
```
- Retire le bâtiment de `buildings[]`
- Libère les workers

### ESPIONNER
```
ESPIONNER [nom civ cible] (personnes: X)
```
- Crée processus `mission` avec `resolve_type: 'espionnage'`
- Résolution via `resolveSpying()` dans `civInteractions.js`
- Succès : gain d'information sur la cible
- Échec possible : agents capturés

### ENVOYER_EMISSAIRE
```
ENVOYER_EMISSAIRE [nom civ cible] (personnes: X)
```
- Crée processus `mission` avec `resolve_type: 'emissaire'`
- Résolution : insère relation 'neutre' dans `diplomacy`

### ENVOYER_MARCHANDS
```
ENVOYER_MARCHANDS [nom civ cible] (personnes: X, offre: res, demande: res)
```
- Crée processus avec `resolve_type: 'commerce_expedition'`
- Résolution via `resolveTradeExpedition()`

### DIPLOMATIE
```
DIPLOMATIE [action] → [civ cible]
```
- Change la relation diplomatique (alliance, paix, guerre...)
- Modifie `diplomacy.relation`

### LOI
```
LOI [description libre]
```
- Effet moral : ±5 (décision politique)

### ATTAQUER
```
ATTAQUER [nom civ cible]
```
- Déclare la guerre et résout un combat immédiat via `resolveWar()`
- Résultat basé sur `military_power` des deux civs
- Écrit `{ type: 'combat', victoire, adversaire, pertes, description }` dans `last_consequences` des deux civs
- Met à jour `army_soldiers`, `military_power`, `moral`, `last_combat_tick` des deux civs
- Insère relation `'guerre'` dans `diplomacy`
- Écrit en mémoire (`diplomatie` + `histoire`) pour les deux civs

### CHASSER
```
CHASSER [nom groupe animal] personnes:[N]
```
- Chasse un groupe animal découvert
- Gains : nourriture + peaux + os selon size × dangerosite
- Sans armes (army=0, fer<10, silex<20) ET dangerosite≥3 → morts possibles
- Si group.size=0 → respawn au point d'origine
- Voir `skills/animals.md` pour détails complets

### RIEN
```
RIEN
```
- Tick passé sans action. Frustration +1/tick au lieu de +0.5.

---

## Résolution (resolveEffect)

Appelé pour chaque effet parsé. Retourne un objet `updates` à appliquer sur la civ.

```js
resolveEffect(effect, civState, allCivs, worldId, biomesMap, events, currentTick)
→ { buildings, army_soldiers, resources, ... }
```

### Vérifications communes
- `freeLabor` : workers disponibles avant AFFECTER/CRÉER/ENVOYER
- Ressources suffisantes avant CRÉER (CREATION_COSTS)
- Civ cible connue avant missions diplomatiques

---

## buildCivContext
Construit le contexte passé au prompt LLM :
```js
{
  nom, gouvernement, description, valeurs,
  population, housed, homeless, population_trend,
  resources, resourceBilan,
  territory_count, territory_used, territory_biomes,
  structures,          // bâtiments actifs avec prod_per_tick
  active_processes,    // processus en cours
  moral, moralLabel,
  army_soldiers, army_power,
  neighbors,           // civs connues avec relation + population
  last_consequences,   // événements du tick précédent
  food_famine_in,      // ticks avant famine (null si ok)
  season, month_name, year,
  known_deposits,      // gisements sur le territoire
  moral, moralLabel,   // moralLabel : 'excellent'|'correct'|'tension'|'mécontentement'|'révolte'
  frustration_ticks,   // { valeur: nbTicks } — brut depuis DB
  satisfactions,       // [] — valeurs satisfaites ce tick
  civ_memory,          // string JSON brute — parsée par getMemoryShort() dans civPromptVariants.js
  prompt_variant,      // V0–V9 — sélecteur de builder dans civPromptVariants.js
}
```
