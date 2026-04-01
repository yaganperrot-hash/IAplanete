# SESSION_RECAP.md — Bilan de session en cours

> Dense, économise les tokens. Une fois intégré au code → vider ce fichier.

## Session : 2026-03-31

### Fait cette session (Specs 1–12 — Expérience variants prompts)
- ✅ **Spec 1** — `hasAnimalAttack` dans `needsDecision` (civEngine.js) — LLM déclenché sur `attaque_animaux`
- ✅ **Spec 2** — Verb `ATTAQUER` : ajouté dans `VERBES_VALIDES`, `parseAction`, conséquences `combat` dans Ollama + Gemini ; `case 'ATTAQUER'` complet dans `civActionResolver.js` via `resolveWar`
- ✅ **Spec 3** — `moralSystem.js` — satisfaction `guerre` requiert maintenant `army_soldiers > 0` + `frustratedText` ajouté
- ✅ **Spec 4** — `migrate.js` — colonne `prompt_variant TEXT DEFAULT 'V0'` sur `civilizations` + table `civ_snapshots`
- ✅ **Spec 5** — `civPromptVariants.js` créé — 9 builders V1–V9 (minimal, psychologique, corps, urgence, géopolitique, économique, chronique, valeurs-tension, oracle)
- ✅ **Spec 6** — `civOllamaLLM.js` — `buildPrompt` → `buildPromptV0`, import `buildVariantBody`, sélecteur wrapper
- ✅ **Spec 7** — `civGeminiLLM.js` — idem
- ✅ **Spec 8** — `civActionResolver.js` — `prompt_variant: civ.prompt_variant || 'V0'` dans `buildCivContext`
- ✅ **Spec 9** — `civEngine.js` — bloc snapshot toutes les `SNAPSHOT_INTERVAL_TICKS` ticks après boucle LLM
- ✅ **Spec 10** — `civSeed.js` — 10 civs V0–V9 (positions vérifiées, toutes dans 256×192)
- ✅ **Spec 11** — `.env` — `TICK_INTERVAL_MS=60000`, `SNAPSHOT_INTERVAL_TICKS=20`
- ✅ **Spec 12** — `analyzeVariants.js` créé — stats par variant (pop growth, moral moyen, guerres, frustration max)

### Bugs civPromptVariants corrigés (après implémentation)
- ✅ `frustration_ticks` ajouté dans `buildCivContext` → variants V1–V9 voient les frustrations
- ✅ `moralLabel` ajouté dans `buildCivContext` → plus de `undefined` dans V2/V3/V5/V6
- ✅ `satisfactions` ajouté dans `buildCivContext` → V8 peut marquer les valeurs satisfaites
- ✅ `getMemoryShort` corrigé → lit `ctx.civ_memory` (domaines identite/histoire/diplomatie/pressions)
- ✅ `population` ajouté dans `neighbors` → V5 affiche la vraie population des voisins

### Pour lancer l'expérience
```bash
rm backend/data/aiplanet.db
node backend/scripts/civSeed.js
npm run dev
# après ~20 ticks (20 min) :
node backend/scripts/analyzeVariants.js
```

---

## Session : 2026-03-30

### Fait cette session
- ✅ **Moral guerre** : frustration ×1.0/tick (était ×0.5), plafond supprimé (conforme CLAUDE.md)
- ✅ **Événements de tension de valeur** : `checkValueTensionEvents` dans civEngine.js — seuil 15 (léger) et 30 (fort) pour 11 valeurs, cooldown 10 ticks, colonne `value_event_ticks` en DB
- ✅ **Prompt urgences** : marqueurs 💀/🔥/⚠️ dans civGeminiLLM.js et civOllamaLLM.js
- ✅ **Mémoire structurée** : 5 domaines (identite/savoir/diplomatie/pressions/histoire), max 8 entrées FIFO, moteur seul, chargement sélectif, format identique Gemini+Ollama. Colonne `civ_memory`, `addMemoryEntry` exportée, triggers complets.
- ✅ **Validation des valeurs** : liste canonique des 11 valeurs. Validation dans `civSeed.js` et route POST `/api/civs`, remplacement des valeurs inconnues par `survie` avec warning.
- ✅ **Satisfactions affichées dans le prompt** (Ollama + Gemini) — LLM voit ses réussites
- ✅ **Fix condition commerce** : satisfaite si voisin connu OU route active (moralSystem.js)
- ✅ **Suppression `connaissance` des tension events** — alias fantôme retiré (civEngine.js)
- ✅ **Énergie divine + Souhaits — backend** : colonnes `energy` + `current_wish` DB, accumulation +3/tick/valeur satisfaite cap 200, `SOUHAIT:` parsé depuis LLM, route `POST /api/civs/:id/intervene` (9 actions)
- ✅ **Frontend énergie divine** : CivCard.jsx — barre énergie, souhait affiché, 9 boutons interventions
- ✅ **Audit last_consequences** : 4 bugs corrigés — `premier_contact` écrit en DB, `animal_decouvert` + `chasse` affichés dans LLM, `homeless_deaths` exposé depuis `buildCivContext`
- ✅ **Fix LLM non déclenché** : `surplus < 0` ajouté dans `needsDecision`, `CRÉER` 0 workers bloqué, `last_consequences` mergé au lieu d'écrasé
- ✅ **Fix armée > pop** : `newSoldiers = min(army, floor(pop * 0.6))` dans civEngine.js Étape 1
- ✅ **Prescription guerre supprimée** : phrase moraliste retirée de moralSystem.js + ligne ARMÉE neutre dans civGeminiLLM.js
- ✅ **Section ARMÉE ajoutée dans civOllamaLLM.js** + `last_combat_tick` exposé dans `buildCivContext`
- ✅ **Reliques visibles juste avant la décision** : `getTexteReliquesPossedees`, filtre `used=0, taken=1`, section omise si vide
- ✅ **`peaux` et `os` affichés même à 0** dans Ollama + Gemini
- ✅ **Reliques par niveau techno** : `getCivEra`, `ERA_ORDER`, `discoverRelicsInTerritory` refaite (diff>1→ignorée, diff=1→incomprise+mémoire, diff=0→normale)
- ✅ **Fix dépendance circulaire** : `addMemoryEntry` déplacée vers `civActionResolver.js`
- ✅ **Spawn civs rapproché** : capitales à (115,80) et (135,80)
- ✅ **Érudits** : valeurs corrigées → `savoir`, `art`, `commerce` (suppression culture/technologie fantômes)
- ✅ **`premier_contact` symétrique** : `last_consequences` + `addMemoryEntry` pour `foundCiv` aussi (civEngine.js ~ligne 916)


### Autres bugs ouverts
- 🟡 `chat-server.js` à la racine — usage inconnu, à investiguer

### Backlog
- 🗂️ Protocole "Bring your own agent"
- 🏺 Reliques pondérées selon niveau techno
- 🏰 Remparts sans logique spatiale
- 🐺 Diversité réponses animaux agressifs
- 🎨 Sprites bâtiments
- ⏳ Durée de vie bâtiments
- 🧠 Simulation des habitants (artisans / soldats / paysans)

### Notes permanentes
- Route civs : `/api/civs` (pas `/api/civilizations`)
- Procédure reset : `POST /api/civs/reset` → `node backend/scripts/civSeed.js` → redémarrer backend
- 14 ressources : `nourriture bois pierre glaise silex sable sel cuivre etain fer or charbon peaux os`
