# sim-logic.md — Moteur de simulation (Civilisations V3)

## Fichiers clés
- `backend/src/simulation/civEngine.js` — boucle principale
- `backend/src/simulation/civActionResolver.js` — updateResources, resolveEffect, etc.
  - Fonctions exportées : `updateResources`, `calculateHoused`, `advanceProcesses`, `resolveEffect`, `parseEffets`, `buildCivContext`, `initTerritory`, `computeFoodRegen`, `expandTerritory`, `discoverAdjacentCivs`, `getTerritoryCapacity`, `normalizeBuildings`, `categorizeStructure`, `calculateProduction`, `getEquipmentLabel`, `getMilitaryPower`, `getSeasonMod`
- `backend/src/simulation/moralSystem.js` — calculateMoral, checkWorkerConsistency
  - Fonctions exportées : `calculateMoral`, `checkWorkerConsistency`
- `backend/src/simulation/civInteractions.js` — contact frontière, espionnage, commerce

---

## Tick (1 tick = 1 mois)

### Calendrier
```js
MONTHS = [Janvier→hiver, Février→hiver, Mars→printemps, ..., Décembre→hiver]
getCurrentMonth(tick) // MONTHS[(tick-1) % 12]
getCurrentYear(tick)  // floor((tick-1) / 12) + 1
```
Tick démarre à `tick=2` (Mars, printemps) via `civSeed.js`.

### Étapes du tick
1. **Ressources + Démographie + Événements** (toutes civs)
2. **Processus actifs** (`advanceProcesses`) → constructions terminées, missions résolues
3. **Brouillard de guerre** → `discoverAdjacentCivs`, `checkFrontierContact`
4. **Décisions LLM** (civs idle/famine/attaque/urgence logement uniquement)
5. **Persister** (DB transaction)
6. **Broadcast** Socket.io (`civ:tick:update`)

---

## Ressources

### 14 ressources
`nourriture bois pierre glaise silex sable sel cuivre etain fer or charbon peaux os`

`peaux` et `os` : obtenus via chasse (CHASSER). Questions dans buildDynamicQuestion si stock > 50.

### Production (via updateResources)
- **Zéro sans travailleurs** — `workers > 0` requis
- Taux par catégorie (`PRODUCTION_RATES`) × saison (`SEASON_MODS`)
- Saisons agricoles : hiver=0, printemps=×1, été=×1.2, automne=×1.5

### Consommation
- Nourriture : `pop × 0.1` / tick
- Bois (chauffage) : `pop × 0.05 / tick` (×2 en grand froid)

### Logement
- Rôle `habitation` dans buildings, champ `capacity` (défaut 20)
- `calculateHoused()` : somme des capacités
- `homeless = Math.max(0, pop - housed)` — **toute la pop est sans-abri si aucune habitation construite**
- Sans-abri en hiver : `homelessDeaths = ceil(homeless × 0.10)` / tick (0.20 si grand froid)
- ⚠️ Ancienne logique (`housed > 0 ? homeless : 0`) supprimée — le cercle vicieux est corrigé

---

## Démographie

### Naissances
- Naturelles chaque tick si ressources ok
- Événement "naissances nombreuses" : `birthBonus × 2.0`

### Morts
- Naturelles (vieillesse)
- Famine (`famineDelta < 0`)
- Sans-abri en hiver (`homelessDeaths`)
- Événements (inondation, épidémie, incendie...)
- Révolte (`revoltLoss = 3% pop` si moral < 20)

---

## Moral (moralSystem.js)

### Base
```
moral = 60  // neutre
```

### Modificateurs
| Condition | Delta |
|---|---|
| Nourriture = 0 | -30 |
| Nourriture > pop×5 | +10 |
| >30% sans-abri | -floor(pct×20) |
| >0% sans-abri | -floor(pct×10) |
| Densité > 40 hab/case | -10 |
| Densité > 60 hab/case | -10 supplémentaire |
| Valeur satisfaite | +8 (fixe) |
| Valeur frustrée | -round(frustTicks × 0.5), min moralMalus×4 |

### Frustration cumulative
`frustration_ticks[valeur]` incrémente chaque tick de frustration, reset à 0 si satisfait.
**Pas de plafond** sur `frustration_ticks`.

### Seuils
- ≥75 : excellent
- ≥60 : correct
- ≥45 : tension
- ≥30 : mécontentement
- <30 : révolte

### Révolte
- Seuil : `moral < 20 && pop > 50`
- Chance : `(20 - moral) × 0.02`
- Conséquences : `-3% pop`, `-2 cases territoire random`

---

## Événements aléatoires (rollEvents)

| Événement | Saison | Probabilité | Effet |
|---|---|---|---|
| Sécheresse | été | 5% | agriMod × 0.2 |
| Inondation | printemps | 3% | -2% pop |
| Tempête | automne/hiver | 4% | -50 à -100 bois |
| Grand froid | hiver | 6% | bois ×2 consommé |
| Incendie | été | 3% | -1 à -5 morts, -100 bois |
| Épidémie | si pop > 200 | 2% | -3% pop |
| Bonne récolte | automne | 8% | agriBonus × 2.0 |
| Naissances | toutes | 5% | birthBonus × 2.0 |

---

## Processus (civ_processes)

### Limite de constructions simultanées
**Max 2 constructions `en_cours` par civ** — toute tentative supplémentaire est rejetée (`[ECHEC] Déjà N constructions en cours`).

### Workers post-construction
Les constructeurs deviennent auto-workers du bâtiment **sauf** pour les rôles passifs :
`habitation`, `defense`, `religieux`, `surveillance` → workers = 0 (constructeurs libérés dans le pool).

### Types
- `construction` : bâtiment en cours (durée en ticks, workers affectés)
- `exploration` : éclaireurs partis (territoire ajouté à la fin)
- `mission` : personnes envoyées (retournent à la fin)
- `espionnage` (resolve_type) : résolution via `resolveSpying`
- `commerce_expedition` : résolution via `resolveTradeExpedition`
- `emissaire` : établit relation diplomatique

### État
- `en_cours` → `terminé` une fois `ticks_remaining = 0`
- `advanceProcesses()` décrémente, résout, met à jour buildings

---

## Travailleurs

```
totalLabor  = floor(pop × 0.6)
freeLabor   = totalLabor - structWorkers - processWorkers - army_soldiers
```
`checkWorkerConsistency()` retourne `freeLabor`.

---

## Bâtiments et ressources de départ (civSeed.js)

La civ est supposée exister avant le tick 1. Elle démarre avec :

| Bâtiment | Rôle | Workers | Capacité |
|---|---|---|---|
| Champs collectifs | agriculture | 15 | — |
| Huttes du peuple | habitation | 0 | 60 |
| Camp de bûcherons | bois | 10 | — |

Ressources initiales : `nourriture:400, bois:150, pierre:80, glaise:30, silex:40`

**Pourquoi :** sans bâtiments de départ, la nourriture (200 unités / 10 conso/tick) s'épuise en 20 ticks avant que le LLM puisse construire une ferme (5 ticks de construction). Spirale de mort garantie.

---

## Animaux

Voir `skills/animals.md` pour la doc complète.

Fonction principale : `updateAnimalGroups(worldId, currentTick, allCivs)` dans `civEngine.js`
Appelée à chaque tick avant les décisions LLM.
- Mouvement (fuite peureux, migration saisonnière, agressifs aléatoire)
- Attaques auto si agressif ≤2 cases territoire
- Découverte si groupe ≤5 cases territoire
- Respawn si size=0

---

## Reliques

Voir `skills/relics.md` pour la doc complète.

Fonctions ajoutées dans `civEngine.js` :
- `processRelicUsage()` — détecte utilisation cohérente (matching action/domaine)
- `applyRelicBonuses()` — applique bonus + stocke dans last_consequences avec attribution

Fonction ajoutée dans `civActionResolver.js` :
- `discoverRelicsInTerritory()` — déclenché à la fin d'une exploration

---

## Auto-expansion territoriale
Si `pop / territory_count > 50` → expansion automatique de `1 + floor(density/50)` cases par tick.
Direction aléatoire parmi `[nord, sud, est, ouest]`.

---

## Chargement du monde (civEngine.js)

Le moteur charge toujours le monde **le plus récent** :
```js
"SELECT id FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1"
```
⚠️ Sans `ORDER BY id DESC`, le moteur chargerait le premier monde créé (bug historique).

### Séquence de reset / seed
1. `POST /api/civs/reset` (ou via UI)
2. `node backend/scripts/civSeed.js` → crée nouveau monde + civs
3. **Redémarrer le backend** → moteur charge le nouveau monde (id le plus élevé)

⚠️ Le même `ORDER BY id DESC` est requis dans **deux fichiers** :
- `backend/src/simulation/civEngine.js` (chargement moteur)
- `backend/src/routes/civilizations.js` → `getCivWorld()` (route API)
