# SESSION_RECAP.md — Bilan de session en cours

> Dense, économise les tokens. Une fois intégré au code → vider ce fichier.

## Session : 2026-03-28

### Accompli
- Création infrastructure docs/ et skills/ (fichiers vides → remplis avec contenu réel)
- **PATCH V4 prompt LLM** : civOllamaLLM.js entièrement réécrit
- **Mémoire stratégique** : colonne `memoire` ajoutée (migrate.js)
- **civEngine.js** : passe `memoire` + `frustration_ticks` au LLM, stocke `nouveauCap` après chaque tick
- **Fix cap ressources** : `Math.min(9999, ...)` supprimé de `updateResources`
- **Fix doublons** : système de fusion CRÉER supprimé — chaque bâtiment indépendant
- **Fix homeless** (DeepSeek) : `homeless = Math.max(0, pop - housed)` — cercle vicieux corrigé
- **Fix frontend** (DeepSeek) : bâtiments groupés `🌾 Ferme ×3` dans CivCard
- **Task 1 ✅** (DeepSeek) : Task C supprimée de civOllamaLLM.js
- **Task 2 ✅** (DeepSeek) : 2 civs de test dans civSeed.js
  - "Les Conquérants du Feu Sacré" — expansion/guerre/spiritualité — monarchie — centre (128, 96)
  - "Les Érudits d'Aristos" — savoir/culture/technologie — aristocratie — loin (50, 50)

- **Fix civEngine chargement monde** (DeepSeek) : `ORDER BY id DESC LIMIT 1` — moteur chargeait toujours le 1er monde au lieu du dernier
- **Fix route /api/civs** (DeepSeek) : même correction dans `getCivWorld()` de `civilizations.js` ligne 15
- **Fix prompt LLM sans-abri** (DeepSeek) : `getTextePopulation()` dans `civOllamaLLM.js` affiche maintenant morts de froid + % sans-abri en urgence avant tout autre texte
- **Fix spirale de la mort** (DeepSeek) : `civSeed.js` — 3 bâtiments de départ + ressources augmentées
  - `nourriture: 400` (était 200), `bois: 150` (était 100), `pierre: 80` (était 50)
  - Bâtiments initiaux : Champs collectifs (agri, 15 workers), Huttes du peuple (habitat, cap 60), Camp de bûcherons (bois, 10 workers)
  - Justification : la civ existait avant le tick 1, ce n'est pas une aide artificielle
- **Fix constructions multiples** (DeepSeek) : `civActionResolver.js` — max 2 constructions simultanées (rejet si ≥ 2 en cours)
- **Fix workers habitation** (DeepSeek) : `civActionResolver.js` — constructeurs libérés après construction de rôle habitation/defense/religieux/surveillance (plus coincés dans le bâtiment)
- **Fix prompt structNote** (DeepSeek) : `civOllamaLLM.js` — structures affichées avec rôle+capacité+workers + avertissement chantiers actifs

### Procédure reset validée
1. `POST /api/civs/reset`
2. `node backend/scripts/civSeed.js`
3. Redémarrer backend → `✓ Monde Civilisations chargé (id=N)`

- **Fix cercle vicieux pierre** (DeepSeek) : `civActionResolver.js` — `extraction: { bois: 20 }` (pierre supprimée des coûts) — une civ sans pierre pouvait JAMAIS produire de pierre
- **Fix LLM aveugle ressources à 0** (DeepSeek) : `civOllamaLLM.js` — `getTexteRessources()` affiche désormais bois/pierre/glaise même à 0 ("pierre : aucun stock") — le LLM ne voyait pas les manques critiques
- **Système Reliques complet** (DeepSeek) :
  - DB : table `relics` (id, world_id, name, description, type, domain, x, y, discovered_by, discovered_at_tick, taken, used, bonus_remaining)
  - Pool : `backend/src/data/relicsPool.js` — 20 reliques, 3 types (objet/art/construction), 4 domaines (outil/arme/art/ruines)
  - Spawn : 10 reliques à la seed, rayon 15-30 cases autour des civs, évite océan
  - Découverte : `discoverRelicsInTerritory()` dans `civActionResolver.js` lors des explorations
  - Prompt : `getTexteReliques()` dans section éclaireurs + attribution bonus dans last_consequences
  - Bonus : `processRelicUsage()` + `applyRelicBonuses()` dans `civEngine.js` — détection par matching action/domaine
  - Frontend : section Reliques dans CivCard (icônes 👜✨), marqueur 🏺 sur la carte
  - Socket : champ `relics` dans broadcast tick

### Prochaines priorités
1. ✅ ~~LLM ne comprend pas l'urgence logement~~ — corrigé
2. ✅ ~~Constructions en doublons~~ — corrigé (limite 2 simultanées + structNote enrichi)
3. ✅ ~~Cercle vicieux pierre~~ — corrigé (coût extraction sans pierre)
4. ✅ ~~LLM aveugle aux ressources à 0~~ — corrigé (affichage systématique)
5. ✅ ~~Système Reliques~~ — implémenté complet (DB + pool + spawn + découverte + prompt + bonus + frontend)
6. ✅ ~~Fix spawn reliques~~ — rayon 5-12 cases (déjà en place) + discoverRelicsInTerritory à l'auto-expansion (déjà en place) + **ajout** : appelé aussi lors des colonisations (`civActionResolver.js` ligne 728)
7. ✅ ~~Prompt intro gouvernement~~ — `getRoleIntro(ctx)` selon gouvernement, phrase ancrage sans "jeu"
8. ✅ ~~Silex/glaise question dynamique~~ — `buildDynamicQuestion(ctx)`, seuil 80
9. ✅ ~~Système Animaux~~ (DeepSeek) :
   - DB : table `animal_groups` + ressources `peaux` et `os`
   - Pool : `backend/src/data/animalsPool.js` — 15 espèces (agressif/peureux/oiseau)
   - Spawn : 20 groupes, rayon 8-20 cases, respawn si size=0
   - Mouvement : `updateAnimalGroups()` — fuite peureux, migration saisonnière (±5 cases/tick), agressifs aléatoire
   - Attaques auto : agressifs ≤2 cases → food/pop damage, réduit si armée
   - Verbe CHASSER : gains nourriture/peaux/os, morts si sans armes + dangerosite≥3
   - Prompt : `getTexteAnimaux()` section éclaireurs + questions peaux/os dans buildDynamicQuestion
   - Frontend : 🐺🦌🦅 sur CivMap, broadcast socket animal_groups
10. ✅ ~~Fix timeout LLM~~ — timeout 30s→60s, num_predict 800→1200, getTexteAnimaux réduit à 3 lignes max
11. ✅ ~~Chargement conditionnel prompt~~ — animaux/reliques/voisins/minéraux/frustrations/processus uniquement si pertinents → prompt ~1200 tokens An 1
12. 🔴 **Reset + seed** — tester animaux + reliques ensemble
11. 🟡 Moral guerre : frustrations de valeurs noyées dans moral global élevé
12. 🟡 `chat-server.js` à la racine — usage inconnu

### Notes
- Tâche C (valeurs → suggestions bâtiments) définitivement annulée
- Route civs : `/api/civs` (pas `/api/civilizations`)

### Backlog (idées à spécifier plus tard)
- 🗂️ **Mémoire structurée par domaine** — fichiers par civ (identite/savoir/diplomatie/tensions) + chargement sélectif selon contexte du tick. Protocole "Bring your own agent" séparé.
- 🎨 **Images bâtiments** — sprites ou icônes pour chaque structure sur la carte/CivCard
- 💭 **Souhaits des civs** — voix du peuple distincte du dirigeant, à spécifier
- ✅ ~~Animaux~~ — implémenté
- ⏳ **Durée de vie bâtiments + variété bois** — dégradation, maintenance, matériaux (à spécifier)
