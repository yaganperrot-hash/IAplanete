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
