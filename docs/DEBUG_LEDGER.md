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

## Bugs ouverts

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
- **Symptôme** : Les 10 civs de l'expérience variants tournent toutes en V0 — les variants V1–V9 n'ont aucun effet.
- **Cause** : `civEngine.js` (~ligne 989) appelle `buildCivContext()` sans y passer `civ.prompt_variant`. La valeur n'est donc jamais dans `ctx` quand `buildVariantBody(ctx, variant)` est appelé.
- **Fix attendu** : Après l'appel `buildCivContext(...)`, ajouter `context.prompt_variant = civ.prompt_variant || 'V0'`.
- **Fichiers** : `civEngine.js`
- **Statut** : 🔴 Ouvert
- **Leçon** : Tout champ DB utilisé par le LLM doit être explicitement ajouté au contexte — `buildCivContext` ne lit pas automatiquement toutes les colonnes.

### [2026-03-31] last_consequences jamais retourné par buildCivContext et jamais vidé
- **Symptôme** : Le LLM décide dans le vide — il ne voit jamais les conséquences de ses propres décisions du tick précédent. La colonne `last_consequences` grossit à l'infini en DB.
- **Cause** : `buildCivContext()` (`civActionResolver.js`) ne retourne pas `last_consequences` dans l'objet ctx. `civGeminiLLM.js:189` référence `ctx.last_consequences` qui est donc toujours `undefined`. De plus, personne ne vide ce champ après que le LLM l'ait consommé.
- **Fix attendu** : (1) Ajouter `last_consequences: parseJ(civ.last_consequences, [])` dans le retour de `buildCivContext`. (2) Après la décision LLM dans `civEngine.js`, vider le champ : `UPDATE civilizations SET last_consequences='[]' WHERE id=?`.
- **Fichiers** : `civActionResolver.js`, `civEngine.js`
- **Statut** : 🔴 Ouvert
- **Leçon** : La boucle cause→conséquence→LLM est le cœur du système. Vérifier systématiquement que chaque donnée écrite en DB est bien relue ET consommée (vidée).

### [2026-03-31] Reliques possédées jamais injectées dans le prompt LLM
- **Symptôme** : `getRelicsPossessedText()` existe dans `civGeminiLLM.js` et est appelée dans `buildPromptV0()`, mais `ctx.relics` est toujours vide → le LLM ignore les reliques qu'il possède.
- **Cause** : `buildCivContext()` n'interroge jamais la table `relics`. La fonction existe, le prompt l'utilise, mais le câblage DB→contexte est absent.
- **Fix attendu** : Dans `buildCivContext()`, ajouter une requête `SELECT * FROM relics WHERE world_id=? AND discovered_by=? AND taken=1 AND used=0` et retourner le résultat dans `ctx.relics`.
- **Fichiers** : `civActionResolver.js`
- **Statut** : 🔴 Ouvert
- **Leçon** : Quand une fonction de formatage est créée (getRelicsPossessedText), vérifier immédiatement que la donnée source arrive bien dans le contexte.

### [2026-03-31] Double colonne mémoire — memoire vs civ_memory
- **Symptôme** : La mémoire stratégique des civs est perdue à chaque tick — le LLM repart de zéro à chaque décision.
- **Cause** : `civEngine.js` écrit dans la colonne `memoire`, mais `civGeminiLLM.js` (ligne 37) lit `civ_memory`. Les deux colonnes coexistent en DB sans jamais être synchronisées.
- **Fix attendu** : Supprimer la colonne `memoire`, tout migrer vers `civ_memory`. Mettre à jour `civEngine.js` pour écrire dans `civ_memory`.
- **Fichiers** : `civEngine.js`, `migrate.js`
- **Statut** : 🔴 Ouvert
- **Leçon** : Lors d'un renommage de colonne DB, chercher toutes les occurrences de l'ancien nom avant de fermer le ticket.

### [2026-03-31] Événements de tension de valeur non transmis au LLM
- **Symptôme** : `checkValueTensionEvents()` génère des crises internes (frustration élevée) mais le LLM ne les voit jamais — il ne réagit pas à ses propres tensions sociales.
- **Cause** : `checkValueTensionEvents()` (`civEngine.js`) ne pousse pas les événements dans `last_consequences` de la civ concernée.
- **Fix attendu** : Dans `checkValueTensionEvents()`, après avoir généré un événement de tension, l'ajouter dans `last_consequences` de la civ avec `type: 'tension_valeur'`.
- **Fichiers** : `civEngine.js`
- **Statut** : 🔴 Ouvert

### [2026-03-29] chat-server.js à la racine
- **Symptôme** : Fichier `chat-server.js` présent à la racine, usage inconnu.
- **Fix attendu** : Identifier l'origine et supprimer si obsolète.
- **Statut** : 🔴 Ouvert

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
