# DEBUG_LEDGER.md — Historique des bugs et résolutions

## Format
```
### [DATE] Titre du bug
- **Symptôme** : ...
- **Cause** : ...
- **Fix** : ...
- **Fichiers touchés** : ...
- **Statut** : ✅ Résolu / 🔴 Ouvert / 🟡 Partiel
```

---

## Bugs ouverts (vrais)

### [2026-04-07] describeTechnology() filtre cassé — section technologie toujours vide
- **Symptôme** : Section "CE QUE TON PEUPLE SAIT FAIRE" retourne "aucune technique maîtrisée" même avec 30+ bâtiments construits.
- **Cause** : `describeTechnology()` filtrait `s.production === 'savoir'` et `s.production === 'production'`. Les structures n'ont pas de champ `production` — le bon champ est `s.category`.
- **Fix** : Filtres remplacés par `s.category === 'savoir'`, `'production'`, `'extraction'`, `'bois'`, `'commerce'`.
- **Fichiers** : `civPromptFree.js`
- **Statut** : ✅ Résolu (2026-04-07)

### [2026-04-07] Voisins — mauvaise fonction dans le prompt (info simplifiée au lieu de tactique)
- **Symptôme** : Le LLM ne voit que "Arkanis existe" au lieu des rapports d'espions, longueur de frontière, historique commerce.
- **Cause** : `buildPromptFree()` appelait `describeNeighborsNarrative(ctx)` (simplifié) au lieu d'utiliser `knowledge_about`. `buildNeighborInfo()` de civInteractions.js ne pouvait pas être importé (dépendance circulaire).
- **Fix** : Logique inline dans `buildCivContext()` → `ctx.neighbor_info` avec données complètes. Prompt utilise `ctx.neighbor_info || describeNeighborsNarrative(ctx)`.
- **Fichiers** : `civActionResolver.js`, `civPromptFree.js`
- **Statut** : ✅ Résolu (2026-04-07)

### [2026-04-07] Chantiers en cours invisibles au LLM — re-lancement de constructions déjà en cours
- **Symptôme** : Le LLM relance des chantiers déjà en cours car il ne sait pas qu'ils existent. Le 3e chantier est rejeté en ECHEC sans que le LLM puisse planifier en conséquence.
- **Cause** : `buildCivContext()` exposait `active_processes` mais pas les chantiers de construction filtrés et formatés. Aucune section dédiée dans le prompt.
- **Fix** : `ctx.ongoing_constructions` ajouté. Section `[CHANTIERS EN COURS]` dans le prompt si non vide.
- **Fichiers** : `civActionResolver.js`, `civPromptFree.js`
- **Statut** : ✅ Résolu (2026-04-07)

### [2026-04-07] Commerce — échange fixe + vérifications code → pas de liberté IA
- **Symptôme** : Aucun échange commercial abouti. `resolveTradeExpedition()` vérifiait isolationnisme/guerre de la cible et imposait un échange fixe 50 nourriture / 30 bois. Si l'une des deux civs n'avait pas exactement ces montants → échec silencieux. La cible ne savait jamais que des marchands étaient arrivés.
- **Cause** : Architecture décisionniste côté moteur — le code décidait à la place des civs.
- **Fix** : `resolveTradeExpedition()` délivre uniquement `marchands_recus` à la cible. Case DIPLOMATIE commerce → échange proportionnel (~15%) des ressources les plus abondantes des deux civs.
- **Fichiers** : `civInteractions.js`, `civActionResolver.js`
- **Statut** : ✅ Résolu (2026-04-07)

### [2026-04-07] Reliques — descriptions abstraites non contextualisées
- **Symptôme** : Les reliques décrites comme "un artefact mystérieux qui semble très puissant" → le LLM ne sait pas quoi en faire.
- **Cause** : Pool de reliques abstrait, sans description physique. Pas de référence aux matériaux connus de la civ.
- **Fix** : `relicsPool.js` réécrit avec `base_form` (description physique concrète) et `material_era`. `buildRelicPerception()` génère description perceptive : référence aux ressources/biomes connus de la civ.
- **Fichiers** : `relicsPool.js`, `civPromptFree.js`, `civActionResolver.js`
- **Statut** : ✅ Résolu (2026-04-07)

### [2026-04-06] Civs contactées / attaquées ne reçoivent rien dans last_consequences
- **Symptôme** : Une civ envoie un émissaire, des marchands ou attaque → la civ cible n'en sait rien au tick suivant → loop diplomatique sans réponse.
- **Cause** : Toutes les actions inter-civs écrivaient dans `events[]` (Socket.io) mais jamais dans `last_consequences` de la cible.
- **Fix** : Système complet de notifications : `emissaire_recu`, `marchands_recus`, `espion_detecte`, `message_diplomatique` (alliance/paix/commerce/pillage). Feedback émetteur aussi : `emissaire_arrive`, `commerce_reussi/echoue`, `espionnage_reussi/echoue`. `needsDecision` étendu pour tous ces types.
- **Fichiers** : `civEngine.js`, `civActionResolver.js`, `civPromptFree.js`, `civInteractions.js`
- **Statut** : ✅ Résolu (2026-04-06)

### [2026-04-06] TRANSFORMER sans impact mécanique
- **Symptôme** : 206 transformations en 129 ticks (poteries, haches, couvertures...) mais aucun effet sur le jeu. Les objets craftés s'accumulent dans `resources` sans modifier la food cap, la production, l'armée ou le moral.
- **Cause** : Pas de classification des ressources, pas de table de mapping nom→effet, pas d'application de bonus au tick.
- **Fix** : `resourceClassifier.js` (regex → catégorie/stat/per_unit), table `resource_types`, `applyCraftedBonuses` dans civEngine.js, food cap dynamique dans `getFoodCapacity`, `describeCraftedInventory` dans civPromptFree.js.
- **Fichiers** : `resourceClassifier.js` (NEW), `civActionResolver.js`, `civEngine.js`, `civPromptFree.js`, `migrate.js`
- **Statut** : ✅ Résolu (2026-04-06)

### [2026-04-06] `relique_etudiee` non couverte par formatLastConsequences
- **Symptôme** : civEngine.js écrit `{ type: 'relique_etudiee' }` dans last_consequences mais civPromptFree.js n'avait pas de case pour ce type → section [ÉVÉNEMENTS] silencieuse.
- **Fix** : Case `relique_etudiee` ajouté dans `formatLastConsequences`.
- **Fichiers** : `civPromptFree.js`
- **Statut** : ✅ Résolu (2026-04-06)

### [2026-04-05] `no such table: structures` — nightMonitor crash snapshot
- **Symptôme** : `ERREUR snapshot: no such table: structures` — section bâtiments vide dans les rapports.
- **Cause** : Query `FROM structures` — cette table n'existe pas. Les bâtiments sont dans la colonne JSON `buildings` de `civilizations`.
- **Fix** : Query supprimée. Remplacement par parsing du JSON `c.buildings` de chaque civ, groupement par `category/role` avec count et workers.
- **Fichiers** : `nightMonitor.js`
- **Statut** : ✅ Résolu (2026-04-06)

### [2026-04-05] Pop stagnante — naissances bloquées par condition surplus
- **Symptôme** : Population ~100 après 130 ticks (~11 ans). Greniers pleins mais 0 naissances.
- **Cause** : `canBirth` exigeait `surplus >= 0`. Avec tous les workers occupés sur tâches non-alimentaires, le surplus de nourriture était négatif même avec 3000+ unités en stock.
- **Fix** : `surplus >= 0` remplacé par `nourriture > 200`. Seuil moral 40→30. Taux natalité 1.5%→2.5%.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-04-05] PARSER_WARN — JSON tronqué à 1200 tokens
- **Symptôme** : `[PARSER_WARN] Impossible de parser la réponse LLM: Expected ',' or ']' after array element in JSON at position 1718` — récurrent sur plusieurs civs.
- **Cause** : `civOllamaLLM.js` passait `num_predict: 1200` et `temperature: 0.8` au parseur, écrasant ses defaults. Le JSON se générait trop verbeux et se coupait.
- **Fix** : Parser appelé avec `{ temperature: 0.3, num_predict: 800 }`. JSON repair ajouté dans le catch de `civParserLLM.js` (troncature au dernier `}` complet + fermeture du tableau).
- **Fichiers** : `civOllamaLLM.js`, `civParserLLM.js`
- **Statut** : ✅ Résolu

### [2026-04-04] KNOWN_ACTION_TYPES incomplet → faux positifs dans unknown_actions
- **Symptôme** : `CRÉER` (401x), `ENVOYER` (164x), `RIEN` (932x) loggués comme types inconnus alors qu'ils sont gérés par `resolveEffect()`.
- **Cause** : `KNOWN_ACTION_TYPES` dans `civActionResolver.js` contient les types parseur en minuscules (`construire`, `affecter`...) mais pas les verbes résolveur majuscules (`CRÉER`, `ENVOYER`, `RIEN`). Le check `!KNOWN_ACTION_TYPES.includes(effect.verb.toLowerCase())` échoue car `créer` et `envoyer` ne sont pas dans la liste.
- **Fix attendu** : Ajouter `'créer'`, `'envoyer'`, `'rien'`, `'transformer'` à `KNOWN_ACTION_TYPES`.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-04-04] Noms de bâtiments absurdes (`5`, `10`, `20`, `42`, `tâche générale`)
- **Symptôme** : Des bâtiments avec noms numériques ou génériques apparaissent dans `buildings[]`. Ex : `7x 5`, `6x 10`, `5x tâche générale`.
- **Cause** : `actionToEffetLine()` pour `CONSTRUIRE` utilise `p.split(/\s+/)[0]` comme nom de bâtiment. Si le parseur retourne `quantite` ou `tache` comme premier token, le nom devient un chiffre ou une tâche.
- **Fix** : Validation `/^\d+$/` ajoutée — fallback sur `action.cible || 'Construction'` si nom numérique ou vide.
- **Fichiers** : `civOllamaLLM.js`, `civGeminiLLM.js`
- **Statut** : ✅ Résolu

### [2026-04-04] `last_consequences_narratif` absent du contexte — section [ÉVÉNEMENTS] toujours vide
- **Symptôme** : Section `[ÉVÉNEMENTS] CE QUI VIENT DE SE PASSER` vide à chaque tick. Le LLM ne voit jamais les combats, chasses, reliques, premiers contacts du tick précédent.
- **Cause** : `civPromptFree.js` lisait `ctx.last_consequences_narratif` qui n'existait pas dans `buildCivContext`. Seul `last_consequences` (array brut) était retourné.
- **Fix** : Ajout de `formatLastConsequences(ctx)` dans `civPromptFree.js` qui traduit le tableau en texte narratif. Ligne remplacée : `ctx.last_consequences_narratif || ''` → `formatLastConsequences(ctx)`.
- **Fichiers** : `civPromptFree.js`
- **Statut** : ✅ Résolu

### [2026-04-03] RECRUTER / UTILISER_RELIQUE / ETUDIER_RELIQUE tombaient en RIEN
- **Symptôme** : Le parseur produisait des actions `recruter`, `utiliser_relique`, `etudier_relique` mais elles étaient converties en `RIEN` par `actionToEffetLine()` → jamais exécutées. Résultat : 0 armée malgré valeur `guerre`, 0 relique utilisée.
- **Cause** : `actionToEffetLine()` dans civOllamaLLM.js et civGeminiLLM.js n'avait pas de `case` pour ces 3 verbes → tombait en `default: return 'RIEN'`. `parseEffets()` et `resolveEffect()` dans civActionResolver.js idem.
- **Fix** :
  - `actionToEffetLine()` (les deux LLM) : RECRUTER → `AFFECTER N → armée`, UTILISER/ETUDIER_RELIQUE → string dédiée
  - `parseEffets()` : patterns UTILISER_RELIQUE + ETUDIER_RELIQUE ajoutés
  - `resolveEffect()` : cases UTILISER_RELIQUE (used=1, bonus moral) + ETUDIER_RELIQUE (savoir, +5 moral)
  - `buildCivContext()` : `last_narrative` ajouté au return
- **Fichiers** : `civOllamaLLM.js`, `civGeminiLLM.js`, `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-29] LLM non déclenché malgré nourriture en déficit
- **Symptôme** : `famine:-1` dans les logs (pop meurt), mais "en cours → pas d'appel LLM". La civ meurt à petit feu sans que le LLM intervienne.
- **Cause** : `isFamine = nourriture <= 0` trop strict. `famineDelta < 0` peut venir de `surplus < 0` (production < consommation) bien avant que le stock atteigne 0. `needsDecision` ne couvrait pas ce cas.
- **Fix** : Calcul de `foodSurplus` dans la boucle LLM. `needsDecision` inclut maintenant `|| foodSurplus < 0`.
- **Fichiers** : `civEngine.js`
- **Statut** : ✅ Résolu

### [2026-03-29] CRÉER à 0 workers crée des processus fantômes
- **Symptôme** : LLM crée des constructions avec 0 workers → `activeCount > 0` → bloque les appels LLM futurs sans rien produire.
- **Cause** : Pas de validation du nombre de workers sur CRÉER pour les bâtiments non-passifs.
- **Fix** : Rejet `[ECHEC] aucun worker affecté` si workers=0 et rôle non passif (habitation/defense/religieux/surveillance).
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-29] `last_consequences` écrasé à chaque tick (Étape 1)
- **Symptôme** : `relique_utilisee`, résultats de chasse, premier_contact écrits en cours de tick puis perdus — le LLM ne les voit jamais.
- **Cause** : `UPDATE ... last_consequences = JSON.stringify(eventMsgs)` en Étape 1 remplaçait tout le contenu structuré par les seuls messages d'événements aléatoires.
- **Fix** : Merger l'existant DB avec les nouveaux eventMsgs. Les objets structurés survivent jusqu'à Étape 3.
- **Fichiers** : `civEngine.js`
- **Statut** : ✅ Résolu

### [2026-03-27] IA répète les mêmes actions
- **Symptôme** : L'IA propose les mêmes constructions à chaque tick (ex: toujours "Habitation").
- **Cause** : Mémoire stratégique (`memoire`) trop vague + modèle 12B limité en nuance.
- **Fix attendu** : Améliorer la qualité des caps stratégiques dans NOUVEAU_CAP_STRATEGIQUE.
- **Fichiers** : `civOllamaLLM.js`
- **Statut** : 🟡 Partiel (prompt V4 a amélioré, pas éliminé)

### [2026-03-29] Moral guerre — frustrations noyées
- **Symptôme** : Civ avec valeur "guerre" à moral 78 stable alors qu'armée=0 depuis 30 ans.
- **Cause** : Le bonus moral des bâtiments militaires compense la frustration "guerre" même sans soldats réels.
- **Fix attendu** : Distinguer "infrastructure militaire" et "activité militaire réelle" dans le calcul moral.
- **Fichiers** : `moralSystem.js`
- **Statut** : 🔴 Ouvert

### [2026-03-29] Reliques non découvertes malgré grand territoire
- **Symptôme** : Civs à 400+ cases de territoire, aucune relique trouvée.
- **Cause** : Territoire en blob autour de la capitale — reliques placées dans des directions non explorées.
- **Fix** : Rayon spawn réduit 5-12 cases + discoverRelicsInTerritory appelé aussi à l'auto-expansion et colonisation.
- **Fichiers** : `civSeed.js`, `civEngine.js`, `civActionResolver.js`
- **Statut** : ✅ Résolu (non testé depuis reset)

### [2026-03-29] `premier_contact` jamais écrit dans last_consequences
- **Symptôme** : `hasFirstContact` dans `needsDecision` reste toujours `false` — le LLM n'est jamais déclenché lors d'un premier contact.
- **Cause** : `discoverAdjacentCivs` (civEngine.js) pousse dans `events[]` (Socket.io) mais n'écrit jamais `{ type: 'premier_contact' }` dans `last_consequences`. `hasFirstContact` cherche ce type en vain.
- **Fix** : Dans civEngine.js Étape 2b, écriture `premier_contact` + `addMemoryEntry` pour `civ` ET `foundCiv`. Contact symétrique.
- **Fichiers** : `civEngine.js`
- **Statut** : ✅ Résolu

### [2026-03-29] `animal_decouvert` écrit mais jamais lu par le LLM
- **Symptôme** : Les civs découvrent des groupes animaux mais le LLM n'en est jamais informé.
- **Cause** : Ni `civOllamaLLM.js` ni `civGeminiLLM.js` ne traitaient `type === 'animal_decouvert'` dans la section CONSÉQUENCES.
- **Fix** : Cas `animal_decouvert` ajouté dans le formateur de conséquences des deux LLM.
- **Fichiers** : `civOllamaLLM.js`, `civGeminiLLM.js`
- **Statut** : ✅ Résolu

### [2026-03-29] Résultats de chasse écrits mais jamais lus par le LLM
- **Symptôme** : Les résultats de chasse poussés dans last_consequences n'étaient pas visibles du LLM.
- **Cause** : Ni `civOllamaLLM.js` ni `civGeminiLLM.js` ne traitaient `type === 'chasse'`.
- **Fix** : Cas `chasse` (succès/échec) ajouté dans les deux LLM avec gains ressources et morts.
- **Fichiers** : `civOllamaLLM.js`, `civGeminiLLM.js`
- **Statut** : ✅ Résolu

### [2026-03-29] `homelessDeaths` lu depuis le mauvais endroit dans civOllamaLLM
- **Symptôme** : La stat `homelessDeaths` affichée dans le prompt Ollama était toujours `undefined`.
- **Cause** : `civOllamaLLM.js` lisait `ctx.last_consequences?.homelessDeaths` — ce champ n'existe pas dans `last_consequences`, c'est une propriété de `consequences` retournée par `updateResources()`.
- **Fix** : `buildCivContext` calcule maintenant `homeless_deaths` (même formule que `updateResources`) et l'expose dans le contexte. `civOllamaLLM.js` lit `ctx.homeless_deaths`.
- **Fichiers** : `civActionResolver.js`, `civOllamaLLM.js`
- **Statut** : ✅ Résolu

### [2026-03-30] Attaques animales jamais déclenchées dans needsDecision
- **Symptôme** : `updateAnimalGroups` écrit correctement `{ type: 'attaque_animaux' }` dans `last_consequences`, mais le LLM n'est jamais appelé en réponse — les civs subissent les attaques sans réagir.
- **Cause** : `needsDecision` (civEngine.js ~ligne 968) ne vérifie pas `attaque_animaux` dans `last_consequences`. `isUnderAttack` ne couvre que la table `diplomacy` (guerre entre civs).
- **Fix** : `hasAnimalAttack = lastConseqs.some(c => c.type === 'attaque_animaux')` ajouté dans `needsDecision`.
- **Fichiers** : `civEngine.js`
- **Statut** : ✅ Résolu (Spec 1 — session 2026-03-31)

### [2026-03-30] Verb ATTAQUER absent — frustration guerre perpétuelle
- **Symptôme** : Civs avec valeur `guerre` restent frustrées indéfiniment. Le LLM n'a pas de verb direct pour déclarer une guerre. `DIPLOMATIE guerre →` fonctionne mécaniquement mais n'est pas proposé comme option explicite, et le résultat de combat n'est jamais écrit dans `last_consequences` (ni pour l'attaquant ni pour le défenseur) → le LLM ne sait jamais qu'il a gagné ou perdu.
- **Cause** : `parseEffets` ne reconnaît pas `ATTAQUER`. `resolveEffect` n'a pas de `case 'ATTAQUER'`. VERBES_VALIDES et le prompt LLM ne mentionnent pas ce verb.
- **Fix** : `ATTAQUER [nom_civ]` ajouté dans `parseEffets`, `resolveEffect`, `VERBES_VALIDES`, prompts Ollama+Gemini. `type: 'combat'` affiché dans la section conséquences des deux LLM.
- **Fichiers** : `civActionResolver.js`, `civOllamaLLM.js`, `civGeminiLLM.js`
- **Statut** : ✅ Résolu (Spec 2 — session 2026-03-31)

### [2026-03-31] prompt_variant jamais transmis au contexte LLM
- **Statut** : ✅ Résolu — migration vers civPromptFree (contexte reconstruit entièrement)

### [2026-03-31] last_consequences jamais retourné par buildCivContext
- **Statut** : ✅ Résolu — civPromptFree + civParserLLM gèrent la boucle cause→conséquence

### [2026-03-31] Reliques possédées jamais injectées dans le prompt LLM
- **Statut** : ✅ Résolu — ctx.relics ajouté dans buildCivContext

### [2026-03-31] Double colonne mémoire (memoire vs civ_memory)
- **Statut** : ✅ Résolu

### [2026-03-31] Événements de tension de valeur non transmis au LLM
- **Statut** : ✅ Résolu

---

## Bugs résolus

### [2026-03-29] Timeout LLM après ajout animaux+reliques
- **Symptôme** : `Ollama civ → mock (timeout)` — tous les appels LLM tombaient en fallback mock.
- **Cause** : Prompt trop long avec nouvelles sections (animaux, reliques, ressources) → Mistral >30s.
- **Fix** : Timeout 30s→60s, num_predict 800→1200, chargement conditionnel (sections absentes si vides).
- **Fichiers** : `civOllamaLLM.js`
- **Statut** : ✅ Résolu

### [2026-03-29] UNIQUE constraint animal_groups (world_id, x, y)
- **Symptôme** : `Error: UNIQUE constraint failed: animal_groups.world_id, animal_groups.x, animal_groups.y` — crash tick.
- **Cause** : Deux animaux tentaient de se déplacer vers la même case au même tick.
- **Fix** : try/catch sur les UPDATE de position — skip silencieux si case occupée.
- **Fichiers** : `civEngine.js` (updateAnimalGroups)
- **Statut** : ✅ Résolu

### [2026-03-29] Cercle vicieux pierre
- **Symptôme** : Les Conquérants échouaient CHAQUE tick à construire militaire/bûcherons (pierre=0). Impossible de produire de la pierre sans pierre.
- **Cause** : `CREATION_COSTS.extraction = { bois: 15, pierre: 10 }` — carrière nécessitait de la pierre.
- **Fix** : `extraction: { bois: 20 }` — pierre supprimée des coûts carrière.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-29] LLM aveugle aux ressources à 0
- **Symptôme** : LLM ne voyait pas que pierre=0 → ne construisait jamais de carrière.
- **Cause** : `getTexteRessources` n'affichait pierre/bois/glaise que si stock > seuil.
- **Fix** : Affichage systématique même à 0 ("pierre : aucun stock").
- **Fichiers** : `civOllamaLLM.js`
- **Statut** : ✅ Résolu

### [2026-03-28] Cercle vicieux habitations
- **Symptôme** : Aucune mort de sans-abri si aucune habitation construite → jamais d'urgence.
- **Cause** : `homeless = housed > 0 ? Math.max(0, pop - housed) : 0`
- **Fix** : `homeless = Math.max(0, pop - housed)`
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-28] Système de doublons CRÉER
- **Symptôme** : CRÉER sur bâtiment existant le renforçait au lieu d'en créer un nouveau.
- **Fix** : Bloc détection doublon supprimé. Chaque CRÉER = case indépendante.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-28] Cap ressources 9999
- **Symptôme** : Stocks plafonnés artificiellement.
- **Fix** : `Math.min(9999, ...)` supprimé de `updateResources`.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu

### [2026-03-28] Moteur chargeait toujours le 1er monde
- **Symptôme** : Après reset, le moteur rechargeait l'ancien monde.
- **Fix** : `ORDER BY id DESC LIMIT 1` dans civEngine.js et civilizations.js.
- **Fichiers** : `civEngine.js`, `civilizations.js`
- **Statut** : ✅ Résolu

### [2026-03-24] Mort en hiver au premier tick
- **Fix** : Seed démarre en Mars (tick=2, printemps).
- **Fichiers** : `civSeed.js`
- **Statut** : ✅ Résolu

### [2026-03-24] Production sans travailleurs
- **Fix** : Suppression auto-gather. Production uniquement si workers > 0.
- **Fichiers** : `civActionResolver.js`
- **Statut** : ✅ Résolu
