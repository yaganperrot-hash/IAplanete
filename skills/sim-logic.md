# sim-logic.md — Moteur de simulation (Civilisations V3)

## Fichiers clés
- `backend/src/simulation/civEngine.js` — boucle principale
- `backend/src/simulation/civActionResolver.js` — updateResources, resolveEffect, etc.
  - Fonctions exportées : `updateResources`, `calculateHoused`, `advanceProcesses`, `resolveEffect`, `parseEffets`, `buildCivContext`, `initTerritory`, `computeFoodRegen`, `expandTerritory`, `discoverAdjacentCivs`, `getTerritoryCapacity`, `normalizeBuildings`, `categorizeStructure`, `calculateProduction`, `getEquipmentLabel`, `getMilitaryPower`, `getSeasonMod`
- `backend/src/simulation/moralSystem.js` — calculateMoral, checkWorkerConsistency
  - Fonctions exportées : `calculateMoral`, `checkWorkerConsistency`
- `backend/src/simulation/civInteractions.js` — contact frontière, espionnage, commerce

---

## Valeurs

Liste canonique des 11 valeurs autorisées :

- `expansion`
- `commerce`
- `guerre`
- `spiritualite`
- `isolationnisme`
- `liberte`
- `ordre`
- `survie`
- `exploration`
- `art`
- `savoir`

Validation appliquée dans :
- `backend/scripts/civSeed.js` (seed initial) — les valeurs inconnues sont remplacées par `survie` avec un warning console.
- `backend/src/routes/civilizations.js` (création via API) — même traitement.

Les valeurs influencent les événements de tension (`checkValueTensionEvents`), les suggestions de bâtiments, et la mémoire d'identité.

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

- `peaux` + `os` : obtenus via chasse (CHASSER). Questions dans buildDynamicQuestion si stock > 50.
- `silex` + `glaise` : questions dans buildDynamicQuestion si stock > 80 (stimule l'invention d'usages).
- **Coût extraction (carrière)** : `{ bois: 20 }` — sans pierre. Mines métal gardent leur coût pierre.

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
| Valeur frustrée | -round(frustTicks × 1.0) — **sans plafond** |

### Frustration cumulative
`frustration_ticks[valeur]` incrémente chaque tick de frustration, reset à 0 si satisfait.
**Sans plafond** — conforme CLAUDE.md §6. Taux : ×1.0/tick (était ×0.5 avant session 2026-03-29).

### Événements de tension de valeur (`checkValueTensionEvents` — civEngine.js)
Déclenchés automatiquement selon `frustration_ticks`, indépendamment du calcul moral.
- Colonne DB : `value_event_ticks TEXT DEFAULT '{}'` — stocke `{ valeur: dernierTickDéclenchement }`
- **Cooldown : 10 ticks** entre deux événements de même valeur
- **Seuil 15 ticks (léger)** : effet mécanique immédiat (soldiers, ressources, processus auto, bâtiment auto)
- **Seuil 30 ticks (fort)** : changement structurel (gouvernement, routes commerciales, bâtiment permanent)

| Valeur | Seuil 15 | Seuil 30 |
|---|---|---|
| `guerre` | Tirage aléatoire : entraînement (+soldiers), rixes (−pop, +soldiers), tournoi (+moral) | Bascule en `dictature_militaire` |
| `commerce` | Caravane auto vers voisin OU marché intérieur (+nourriture) | Bâtiment "Place du marché" auto |
| `expansion` | expandTerritory +2 cases | expandTerritory +4 cases |
| `exploration` | Process exploration auto (workers libres × 0.15, durée variable) | 2e groupe si exploration déjà en cours |
| `savoir` | Bâtiment "Cercle de savants" auto si aucun savoir | +30 silex (expérimentation) |
| `spiritualite` | +5 moral (rites spontanés) | Bâtiment "Lieu de culte rudimentaire" auto |
| `isolationnisme` | −1 active_trade_routes OU annulation émissaire | active_trade_routes = 0 |
| `liberte` | −2% pop (dissidents) | ×2 chance de révolte ce tick |
| `ordre` | Redistribution workers libres sur bâtiments sous-staffés | +soldiers (milice) |
| `survie` | +nourriture (chasse/cueillette sauvage) | Rationnement : conso ×0.7 ce tick |
| `art` | +6 moral (festival) | Bâtiment "Atelier collectif" auto |

Tout événement déclenché → ajouté à `last_consequences` avec `source: "tension_valeur_[valeur]"`.

### Prompt LLM — urgences de frustration
Marqueurs visuels dans civGeminiLLM.js et civOllamaLLM.js :
- `— [texte]` : < 5 ticks
- `⚠️ TENSION (N mois)` : ≥ 5 ticks
- `🔥 TENSION PROFONDE (N mois)` : ≥ 10 ticks (sans conclusion prescriptive)
- `💀 CRISE (N mois)` : ≥ 20 ticks (sans conclusion prescriptive)

Bloc `⚡ PRESSIONS INTERNES URGENTES` injecté avant les jauges (Ollama) / avant les ressources (Gemini) si frustration ≥ 10 ticks.

## Énergie divine + Interventions joueur

### DB
```sql
civilizations.energy REAL DEFAULT 0      -- cap 200
civilizations.current_wish TEXT DEFAULT NULL
```

### Accumulation (civEngine.js Étape 1)
```js
const newEnergy = Math.min(200, (civ.energy || 0) + satisfactions.length * 3);
```
+3 par valeur satisfaite par tick. Sauvegardé dans l'UPDATE SQL.

### Souhait LLM
Champ `SOUHAIT:` ajouté au format de réponse Ollama + Gemini.
Parsé dans `parseResponse` → retourné dans `decision.souhait` → stocké dans `current_wish`.

### Route API
`POST /api/civs/:id/intervene` — body `{ action_type }`

| action_type | Coût | Effet |
|---|---|---|
| `manne_nourriture` | 20 | +300 nourriture |
| `manne_bois` | 15 | +200 bois |
| `manne_glaise` | 15 | +150 glaise |
| `vision_outils` | 30 | mémoire savoir + last_consequences vision_divine |
| `vision_peaux` | 30 | idem |
| `vision_glaise` | 30 | idem |
| `foudre` | 10 | détruit 1 bâtiment non-passif aléatoire |
| `montee_eaux` | 15 | -5% pop + perd 1 case territoire |
| `epidemie` | 15 | -10% pop |

Erreur 400 si énergie insuffisante.

---

### Valeurs canoniques (11 valeurs — validées en code)
`expansion` `commerce` `guerre` `spiritualite` `isolationnisme` `liberte` `ordre` `survie` `exploration` `art` `savoir`

- Validation dans `civSeed.js` et route `POST /api/civs` — valeur inconnue → remplacée par `survie` + warning
- `connaissance` = **supprimé** des tension events (était un alias fantôme)
- `technologie`, `culture` = **non implémentées** — ne pas utiliser dans le seed
- `commerce` satisfait si voisin connu OU route active (fix 2026-03-29)

### Armée
- `army_soldiers` plafonné à `floor(pop × 0.6)` chaque tick — civEngine.js Étape 1
- `last_combat_tick` exposé dans `buildCivContext` → affiché dans ARMÉE (Ollama + Gemini)
- Format prompt : `N soldats, équipement: X (puissance: Y) — dernier combat : tick Z / aucun combat enregistré`

### Déclenchement LLM (`needsDecision`)
```js
isIdle || isFamine || foodSurplus < 0 || isUnderAttack || hasAnimalAttack
|| (hasNoHousing && ['automne','hiver'].includes(season))
|| hasRelicDiscovered || hasFirstContact
```
- `foodSurplus < 0` ajouté — déclenche LLM quand production < consommation, même si stock > 0
- `isFamine` = `nourriture <= 0` (stock vide)
- `isUnderAttack` = diplomacy.relation = 'guerre' (guerre entre civs)
- `hasAnimalAttack` = `last_consequences` contient `type: 'attaque_animaux'` — ⚠️ **spec prête, pas encore implémenté**
- `CRÉER` à 0 workers rejeté si rôle non passif (`[ECHEC] aucun worker affecté`)

### `last_consequences` — cycle de vie
- **Étape 1** : merger avec existant DB (ne plus écraser) — objets structurés survivent jusqu'à Étape 3
- **Étape 2** : advanceProcesses écrit `relique_decouverte`, constructions terminées
- **Étape 2b** : `premier_contact` écrit pour les deux civs (civ ET foundCiv)
- **updateAnimalGroups** : `attaque_animaux` écrit — ⚠️ `needsDecision` ne le détecte pas encore
- **case ATTAQUER** : écrira `{ type: 'combat', victoire, adversaire, pertes, description }` pour les deux civs — ⚠️ pas encore implémenté
- **Étape 3** : LLM lit last_consequences — tous les types visibles
- Types gérés dans les prompts : `relique_decouverte`, `relique_incomprise`, `relique_utilisee`, `animal_decouvert`, `chasse`, `premier_contact`, `attaque_animaux`
- Types à ajouter dans les prompts : `combat` (victoire/défaite entre civs)

### Verbs LLM civs
Verbs actuellement dans `VERBES_VALIDES` et `parseEffets` :
`AFFECTER` `CRÉER` `EXPLORER` `COLONISER` `ENVOYER` `MODIFIER` `ABANDONNER` `DIPLOMATIE` `LOI` `ESPIONNER` `ENVOYER_EMISSAIRE` `ENVOYER_MARCHANDS` `SURVEILLER_FRONTIERE` `CHASSER` `RIEN`

Verb **à ajouter** (spec prête dans SESSION_RECAP.md) :
- `ATTAQUER [nom_civ]` — déclare la guerre et résout un combat immédiat via `resolveWar`

### Ton narrateur — Chroniqueur neutre (refonte 2026-03-29)
**Principe :** décrire la réalité sans prescrire. Le LLM décide seul ce qui compte.

| ❌ Supprimé | ✅ Remplacé par |
|---|---|
| "⚠️ URGENCE — morts de froid" | "N personnes sont mortes de froid ce mois-ci." |
| "⚠️ ALERTE — famine dans N ticks si rien ne change" | "Les réserves s'épuisent dans N mois." |
| "Des bras qui ne travaillent pas, c'est du gaspillage" | "N personnes sont sans occupation." |
| "Construire une Habitation est une question de survie" | (supprimé) |
| "SITUATION CRITIQUE ⚠️" | Faits secs + "Que décides-tu ?" |
| "⚠️ SURPOPULÉ" | "(territoire saturé)" |
| "construisez des structures pour produire" | "(aucune structure construite)" |
| "Sans action radicale, le chaos est imminent" | (supprimé) |
| "NE PAS RECONSTRUIRE CE QUI EXISTE DÉJÀ" | "Constructions existantes :" |

Les contraintes mécaniques (max 2 chantiers) restent — ce sont des faits, pas des prescriptions.

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

## Mémoire structurée des civilisations (`civ_memory`)

Colonne DB : `civ_memory TEXT DEFAULT '{}'` — JSON avec 5 domaines.

### Structure
```json
{
  "identite":   [],
  "savoir":     [],
  "diplomatie": [],
  "pressions":  [],
  "histoire":   []
}
```

### Règles
- **Max 8 entrées par domaine** — FIFO (la plus ancienne supprimée)
- **Moteur seul** — le LLM ne peut pas écrire en mémoire
- **Pas de doublons** exacts dans un même domaine
- Fonction : `addMemoryEntry(civId, domain, entry)` dans **civActionResolver.js** (exportée)
- ⚠️ Ne pas remettre dans civEngine.js — dépendance circulaire (civEngine ← civActionResolver)

### Triggers d'écriture
| Événement | Domaine | Exemple d'entrée |
|---|---|---|
| Création civ (civSeed) | `identite` | `An 1 — Fondée comme théocratie, valeurs: guerre, spiritualité` |
| Construction terminée | `savoir` | `An 3 — Forge construite` |
| Exploration terminée | `savoir` | `An 2 — Territoire exploré : +5 cases` |
| Premier contact civ | `diplomatie` | `An 3 — Premier contact : Arkanis (hostile)` |
| Émissaire envoyé | `diplomatie` | `An 4 — Émissaire envoyé à Arkanis` |
| Route commerciale ouverte | `diplomatie` | `An 5 — Route commerciale ouverte avec Arkanis` |
| Espionnage | `diplomatie` | `An 4 — Espionnage de Arkanis : réussi` |
| Frustration tick = 10 | `pressions` | `An 3 — Tension guerre (10 mois sans satisfaction)` |
| Frustration reset (>5→0) | `pressions` | Suppression de l'entrée correspondante |
| Famine | `histoire` | `An 4 — Famine : réserves épuisées` |
| Révolte | `histoire` | `An 4 — Révolte : -12 hab, 2 cases perdues` |
| Événement deaths ≥ 15 | `histoire` | `An 2 — inondation : -18 habitants` |
| Combat | `histoire` | `An 5 — Combat contre Arkanis : victoire` |

### Chargement sélectif dans le prompt (`formatMemory`)
- `identite` + `savoir` + `histoire` : **toujours chargés**
- `diplomatie` : seulement si voisins connus > 0 ou entrées non vides
- `pressions` : seulement si entrées non vides

Fonction `formatMemory(memory, ctx)` identique dans civGeminiLLM.js et civOllamaLLM.js.
Injectée après "Valeurs fondamentales" dans le prompt.

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
