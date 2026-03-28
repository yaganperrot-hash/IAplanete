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

### [2026-03-27] Spirale de la mort (libre=0)
- **Symptôme** : Quand tous les travailleurs sont affectés (`freeLabor=0`), l'IA ne peut plus rien faire. La civ se bloque.
- **Cause** : Le prompt ne décrit pas l'état "aucun travailleur libre" de façon actionnable. L'IA ne sait pas qu'elle doit désaffecter.
- **Fix attendu** : Ajouter dans `describePopulation` ou `buildDynamicQuestion` une phrase narrative sur le manque de main-d'œuvre libre, sans suggérer la solution.
- **Fichiers** : `civOllamaLLM.js` (buildDynamicQuestion, describePopulation)
- **Statut** : 🔴 Ouvert

### [2026-03-28] LLM ignore l'urgence logement
- **Symptôme** : Les civs ne construisent pas d'habitations malgré des morts de sans-abri en hiver.
- **Cause** : Le prompt `describePopulation` dans `civOllamaLLM.js` ne rend pas l'urgence assez saillante. Le LLM perçoit les morts mais ne les relie pas à un besoin de construction.
- **Fix attendu** : Rendre la description des sans-abri plus narrative et urgente (chiffre de morts + saison + conséquence imminente), sans prescrire la solution.
- **Fichiers** : `civOllamaLLM.js` (describePopulation)
- **Statut** : 🔴 Ouvert

### [2026-03-27] IA répète "culture des champs"
- **Symptôme** : L'IA propose toujours la même action à chaque tick.
- **Cause** : Prompt pas assez différencié selon la situation + modèle trop faible pour la nuance.
- **Fix attendu** : Vérifier que le modèle actif est bien mistral-nemo 12B.
- **Fichiers** : `civOllamaLLM.js` (describeStructures — déjà patché)
- **Statut** : 🟡 Partiel

---

## Bugs résolus

### [2026-03-28] Cercle vicieux habitations (homeless=0 sans habitations)
- **Symptôme** : Aucune mort de sans-abri si aucune habitation n'avait jamais été construite → aucune urgence → jamais de construction.
- **Cause** : `homeless = housed > 0 ? Math.max(0, pop - housed) : 0` — condition initiale empêchait tout déclenchement.
- **Fix** : `homeless = Math.max(0, pop - housed)` — toute la pop est sans-abri si aucun logement.
- **Fichiers** : `civActionResolver.js` (updateResources)
- **Statut** : ✅ Résolu

### [2026-03-28] Système de doublons (fusion CRÉER)
- **Symptôme** : Un CRÉER sur un bâtiment existant le renforçait au lieu d'en créer un nouveau.
- **Cause** : Bloc de détection doublon lignes 600-613 dans resolveEffect.
- **Fix** : Bloc supprimé. Chaque CRÉER = bâtiment indépendant sur sa propre case.
- **Fichiers** : `civActionResolver.js` (resolveEffect)
- **Statut** : ✅ Résolu

### [2026-03-28] Cap nourriture ~9999
- **Symptôme** : Stocks plafonnés artificiellement.
- **Fix** : `Math.min(9999, ...)` supprimé de `updateResources`.
- **Fichiers** : `civActionResolver.js` (updateResources)
- **Statut** : ✅ Résolu

### [2026-03-24] Mort en hiver au premier tick
- **Fix** : Seed démarre en Mars (tick=2, printemps). `civSeed.js`.
- **Statut** : ✅ Résolu

### [2026-03-24] Production sans travailleurs
- **Fix** : Suppression de l'auto-gather. `updateResources()` ne produit que si `workers > 0`.
- **Statut** : ✅ Résolu

### [2026-03-22] army_soldiers confondu avec population
- **Fix** : Colonne séparée `army_soldiers`. Recrutement via AFFECTER uniquement.
- **Statut** : ✅ Résolu
