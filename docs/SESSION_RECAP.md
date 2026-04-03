# SESSION_RECAP.md — Bilan de session en cours

> Dense, économise les tokens. Une fois intégré au code → vider ce fichier.

## Session : 2026-04-01 (suite)

### Expérience nuit — Résultats variants (877 ticks)
- V0 (Conquérants) pop 2090 ✅ | V9 (Mystiques) pop 1935 ✅ | V4 (Gardiens) pop 1652 ✅
- V5 (Khaganat) score 5/7, dominant militaire ✅ | V8 (Ascètes) pop 78 fin (5 révoltes) ⚠️
- Éliminés : V1 (mort), V2 (mort), V3 (mort dès le départ), V6 (quasi-mort), V7 (mort)

### Décisions architecturales
- ✅ **civSeed.js** passé à 10 civs : V0/V4/V5/V8/V9 + 5 nouvelles (Marchands Route d'Or, Cité des Sages, Chasseurs du Vent, Empire des Forges, Pillards de la Côte)
- ✅ **Nouvelle archi LLM prompt-free** : LLM Civ → texte narratif libre → civParserLLM → JSON actions
  - `civPromptFree.js` créé et fonctionnel — `CIV_VOICES` étendu aux 10 civs
  - `civParserLLM.js` créé et fonctionnel — bug user role vide corrigé (2026-04-03)
  - `civOllamaLLM.js` déjà migré vers `buildPromptFree` + `parseCivNarrative`
  - `civGeminiLLM.js` idem
  - `migrate.js` : colonnes `last_narrative`, `last_echecs`, table `unknown_actions` ajoutées
  - `civActionResolver.js` : `echecs_tick_precedent`, `reliques_mystere`, `reliques_used`, `last_narrative` dans buildCivContext

### Bugs corrigés (session 2026-04-01)
- ✅ `civPromptFree.js` ligne 73 : `s.role.includes('mine')` → crash si `s.role` undefined
- ✅ `civParserLLM.js` : user role vide → parseur recevait chaîne vide → `actions: []` à chaque tick
  - Fix : PARSER_SYSTEM (règles) en system, `texte` narratif en user — température 0.8 → 0.2

### Fixes session 2026-04-03
- ✅ `civOllamaLLM.js` + `civGeminiLLM.js` `actionToEffetLine()` :
  - RECRUTER → `AFFECTER N personnes → armée`
  - UTILISER_RELIQUE → `UTILISER_RELIQUE <cible>`
  - ETUDIER_RELIQUE → `ETUDIER_RELIQUE <cible>`
- ✅ `civActionResolver.js` `parseEffets()` : parsing UTILISER_RELIQUE et ETUDIER_RELIQUE ajouté
- ✅ `civActionResolver.js` `resolveEffect()` : cases UTILISER_RELIQUE + ETUDIER_RELIQUE implémentés
  - UTILISER_RELIQUE : mark used=1, bonus moral selon domain (arme +5+soldats, art +15, ruines +10, outil +8), last_consequences
  - ETUDIER_RELIQUE : mémoire savoir, +5 moral, last_consequences — ne consomme pas la relique
- ✅ `civActionResolver.js` `buildCivContext()` : `last_narrative` ajouté au return

### Deepseek — Tâches complétées ✅
- ✅ `civActionResolver.js` : `echecsDuTick[]` capturé sur tous les rejets
- ✅ `civActionResolver.js` : types inconnus loggés dans `unknown_actions`
- ✅ `civEngine.js` : `last_echecs` = vrais échecs

### Commandes reset
```
del backend\data\aiplanet.db
node backend/scripts/civSeed.js
npm run dev
```
