# SESSION_RECAP.md — Bilan de session en cours

> Dense, économise les tokens. Une fois intégré au code → vider ce fichier.

## Session : 2026-04-05

### Bugs corrigés
- ✅ `civPromptFree.js` : `last_consequences_narratif` absent du contexte → section [ÉVÉNEMENTS] toujours vide
- ✅ Migration `savoir` → `connaissance` (valeur civ) : 6 fichiers. `savoir` reste catégorie bâtiment + domaine mémoire.
- ✅ `technologie` ajoutée à VALID_VALUES + moralSystem + civEngine (triggerLight/triggerStrong)
- ✅ KNOWN_ACTION_TYPES incomplet → faux positifs unknown_actions (CRÉER 401x, ENVOYER 164x, RIEN 932x) — corrigé
- ✅ Noms de bâtiments absurdes (`5`, `10`, `42`) → erreur parsing CRÉER — corrigé

### Architecture TRANSFORMER (nouveaux verbes dynamiques)
- ✅ **civParserLLM.js** : schéma enrichi `ressource_entree`, `ressource_sortie`, `nb_personnes` + boucle clarification si ambigu
- ✅ **civParserLLM.js** : prompt système enrichi — priorité 3 étapes pour types inconnus :
  1. Mapper vers verbe existant (cartographier→explorer, route commerciale→envoyer_marchands...)
  2. Si transformation matériau → snake_case + ressource_entree/sortie obligatoires
  3. Si purement narratif (prière, divination...) → snake_case, ressources null, aucune clarification
- ✅ **parsedActionToOld()** (Ollama + Gemini) : types inconnus → TRANSFORMER si input+output présents, RIEN sinon
- ✅ **actionToEffetLine()** : `case 'TRANSFORMER'` → string formatée
- ✅ **parseEffets()** : détecte lignes `TRANSFORMER ...`, retourne objet structuré
- ✅ **resolveEffect()** : `case 'TRANSFORMER'` — consomme input, produit output, log unknown_actions
- ✅ **civPromptFree.js** : `describeResourcesNarrative` + `describeOutils` itèrent sur `ctx.resources` (objet réel) au lieu de la liste fixe RESOURCES — toute ressource créée dynamiquement (amphores, tissu...) est visible au tick suivant
- **Résultat** : tout nouveau verbe inventé par le LLM s'exécute ET la ressource produite est visible + utilisable immédiatement

### Session : 2026-04-05 — Migration retour Ollama + fixes parser

#### Migration LLM (retour Ollama mistral-nemo)
- ✅ llama.cpp `llama3-70b` → Ollama `mistral-nemo` (GPU non détecté sur llama.cpp)
- `civOllamaLLM.js` restauré : endpoint `/api/chat`, vars `OLLAMA_URL` + `OLLAMA_MODEL`
- `.env` : `OLLAMA_URL=http://localhost:11434`, `OLLAMA_MODEL=mistral-nemo`

#### Fix PARSER_WARN JSON tronqué
- ✅ `civOllamaLLM.js` : parser appelé avec `{ temperature: 0.3, num_predict: 800 }` (avant : 0.8/1200)
- ✅ `civParserLLM.js` : JSON repair dans le catch — troncature au dernier `}` + fermeture `]}` avant abandon

#### Seed réduit à 10 civs + tick 120s
- 20 → 10 civs pour tenir dans le budget temps de mistral-nemo local
- `CIV_TICK_INTERVAL_MS=120000` (2 min)
- Civs : Conquérants, Gardiens, Khaganat, Ascètes, Mystiques, Marchands Route d'Or, Cité des Sages, Chasseurs du Vent, Empire des Forges, Pillards de la Côte

#### Types inconnus observés en live ✅
- `envoyer_expedition` — "envoyer une expédition pour trouver du silex"
- `demander_priere` — "demander au conseil des voyants une prière collective"
- Le système capture, logue, n'écrase pas. Philosophie respectée.

#### Bug ouvert : nightMonitor structures
- `no such table: structures` — query structures protégée try/catch pour ne pas bloquer les snapshots

### Analyse simulation nocturne (tick 129, ~4h30)
- 206 transformations émergentes : couvertures (Khaganat), nourriture chaude (Mystiques), haches+lances (Chasseurs)
- La Cité des Sages a voulu construire une **bibliothèque** — non codé, émergent via description ✅
- 0 contact diplomatique en 129 ticks — civs trop éloignées ou trop occupées pour explorer
- Marchands + Chasseurs : moral 0, frustration 107 — bloqués sans pouvoir exercer leurs valeurs
- 956 échecs dont majorité "construire 'construction'" — nom générique, bug parser persistant

### Fixes démographie + habitabilité (2026-04-05 session 2)

#### Habitations initiales (civSeed.js)
- ✅ 3 × "Abris collectifs" (capacity 40) ajoutés au seed → 120 capacité pour 100 habitants
- Plus de homeless deaths dès le tick 1

#### Taux de natalité (civActionResolver.js ligne ~285)
- ✅ `surplus >= 0` supprimé — remplacé par `nourriture > 200`
- ✅ Seuil moral : 40 → 30
- ✅ Taux natalité : 1.5% → 2.5%/tick

#### ABANDONNER dans le prompt (civPromptFree.js)
- ✅ Quand `free_workforce === 0` → phrase narrative ajoutée : "Pour engager une nouvelle initiative, des personnes devront être détachées de leurs occupations actuelles."

### Réflexion design — champ description 500 caractères
- `ctx.description` déjà injecté en position [IDENTITÉ] (premier élément du prompt) ✅
- Preuve que ça marche : Cité des Sages → bibliothèque émergente depuis sa description
- Descriptions actuelles trop courtes (1 phrase) → impact limité face au contexte situationnel
- **Prochaine étape UI** : textarea 500 chars à la création de civ (frontend uniquement — backend déjà prêt)

---

## Session : 2026-04-06

### Système artisanat complet (TRANSFORMER → impact mécanique)
- ✅ `backend/src/simulation/resourceClassifier.js` (NOUVEAU) : classifie tout nom de ressource par regex → catégorie (arme/outil/stockage/textile/art/spirituel/divers) + stat + per_unit
- ✅ `migrate.js` : table `resource_types (name, world_id, category, stat, per_unit, first_seen_tick)` — créée et migrée
- ✅ `civActionResolver.js` — case TRANSFORMER : après création ressource → INSERT OR IGNORE dans resource_types
- ✅ `civActionResolver.js` — `getFoodCapacity(civ, craftedFoodBonus)` : cap = max(500, pop×10 + stockage_artisanat + greniers_bâtiments)
- ✅ `civActionResolver.js` — `updateResources` : production boostée par craftedProductionPct, food plafonnée, `stockage_plein` dans last_consequences si perte > 5
- ✅ `civEngine.js` — `applyCraftedBonuses(civ, worldId, db)` : lit resource_types, calcule 4 bonus (foodBonus, productionPct, militaryBonus, moralBonus), appliqués chaque tick
- ✅ `civPromptFree.js` — `describeCraftedInventory(resources, resourceTypes)` : affiche l'artisanat groupé par catégorie avec effets. Food cap affiché "(1317/1760 max)"

### Système notifications inter-civs (both sides)
**Côté récepteur** (civ qui reçoit) :
- ✅ `emissaire_recu` : quand emissaire arrive → last_consequences cible
- ✅ `marchands_recus` : commerce réussi → last_consequences cible avec `foodRecu`/`boisDonne` exacts (montants réels de `resolveTradeExpedition`)
- ✅ `espion_detecte` : spy capturé → last_consequences cible
- ✅ `message_diplomatique` (action: alliance/commerce/paix/pillage) : DIPLOMATIE → last_consequences cible avec description précise

**Côté émetteur** (civ qui agit) :
- ✅ `emissaire_arrive` : quand son émissaire est arrivé
- ✅ `commerce_reussi/echoue` : résultat expédition
- ✅ `espionnage_reussi/echoue` : résultat + rapport

**Déclenchement LLM** :
- ✅ `needsDecision` étendu : couvre les 9 nouveaux types d'événements entrants + sortants
- ✅ `formatLastConsequences` (civPromptFree.js) : couvre tous les types y.c. `relique_etudiee` (était manquant), `stockage_plein`, les 5 nouveaux types émetteur/récepteur

### Fix nightMonitor structures
- ✅ Query `FROM structures` (table inexistante) → parse du JSON `buildings` de chaque civ
- Structures groupées par catégorie/role dans le rapport HTML

---

## Session : 2026-04-07

### Problèmes analysés (simulation nocturne — pas d'évolution, pas d'échanges)

5 causes techniques identifiées et corrigées. Philosophie respectée : seule la description de réalité est corrigée, aucune suggestion d'action n'est ajoutée au prompt.

### Fix 1 — describeTechnology() filtre cassé
- ✅ `civPromptFree.js` : `describeTechnology()` filtrait par `s.production === 'savoir'` — champ inexistant sur les bâtiments (le bon champ est `s.category`).
- Résultat : la section "CE QUE TON PEUPLE SAIT FAIRE" retournait toujours "aucune technique maîtrisée" même avec des dizaines de bâtiments.
- Fix : filtres remplacés par `s.category === 'savoir'`, `'production'`, `'extraction'`, `'bois'`, `'commerce'`.

### Fix 2 — Info voisins incomplète dans le prompt
- ✅ `civPromptFree.js` : section [VOISINS] appelait `describeNeighborsNarrative(ctx)` (simplifié : "ils existent") au lieu d'utiliser les données tactiques riches de `knowledge_about`.
- ✅ `civActionResolver.js` : `buildNeighborInfo()` de `civInteractions.js` ne pouvait pas être importé (dépendance circulaire). Logique inline directement dans `buildCivContext()`.
- `ctx.neighbor_info` : lignes ▸ par civ connue + relation + frontière + observations + rapports espions + commerce.
- Prompt utilise maintenant `ctx.neighbor_info || describeNeighborsNarrative(ctx)`.

### Fix 3 — Chantiers en cours invisibles au LLM
- ✅ `civActionResolver.js` : `ctx.ongoing_constructions` ajouté — liste des processus `construction` en cours avec `name`, `ticks_restants`, `workers`.
- ✅ `civPromptFree.js` : section `[CHANTIERS EN COURS]` ajoutée dans le prompt si chantiers présents — le LLM sait qu'il ne peut lancer qu'un 3e chantier (max 2 simultanés) et ne re-propose pas ce qui est déjà en construction.

### Fix 4 — Commerce philosophiquement cassé
- ✅ `civInteractions.js` : `resolveTradeExpedition()` entièrement réécrit.
  - Supprimé : vérification isolationnisme/guerre côté cible, échange fixe 50 nourriture / 30 bois.
  - Nouveau : livre uniquement `marchands_recus` dans `last_consequences` de la cible. La cible décide librement au tick suivant.
- ✅ `civActionResolver.js` : case `DIPLOMATIE commerce` remplace l'échange fixe 10 or par un échange proportionnel (~15%) de la ressource la plus abondante de chaque civ (≥30 unités). Si ni l'une ni l'autre n'a de surplus → aucun échange.

### Fix 5 — Reliques abstraites et non contextuelles
- ✅ `backend/src/data/relicsPool.js` : entièrement réécrit. Chaque relique = outil concret légèrement plus avancé que l'ère de la civ qui le trouve.
  - Champ `base_form` : description physique (ex: "un couteau à lame courte, parfaitement tranchant").
  - Champ `material_era` : matière dont l'objet est fait (`cuivre`, `fer`, `inconnu`...).
  - 20 reliques : primitif (outils/armes cuivre/bronze, ruines), metal (outils fer/acier), avance (matière inconnue).
- ✅ `civPromptFree.js` : `buildRelicPerception(relic, civResources, terrBiomes)` génère une description perceptive contextualisée.
  - Référence aux ressources connues de la civ : "de la même matière rougeâtre que vos lingots de cuivre, mais travaillée d'une façon que vos artisans ne maîtrisent pas".
  - Si pas de cuivre en stock mais collines proches : "comme les veines de pierre de vos collines, mais façonnée avec une précision inconnue".
  - Fallback neutre : "plus lourde que le silex, qui ne s'écaille pas quand on frappe".
- ✅ `civActionResolver.js` : `discoverRelicsInTerritory()` passe `base_form` et `era` dans `last_consequences`. `buildCivContext()` enrichit `reliques_actives` avec `base_form` depuis le pool.
