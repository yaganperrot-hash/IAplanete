# CLAUDE.md — WorldIA Civilisations
> Boussole du projet. À lire en premier. À mettre à jour à chaque changement structurel.

---

## 1. PHILOSOPHIE FONDAMENTALE (NE PAS CONTOURNER)

**Laisser les IA le plus libres possible en suggérant simplement.**
- On décrit le monde tel qu'il est. L'IA décide.
- On ne contrôle pas, on ne donne pas de but, on ne menace pas.
- Le prompt LLM est une description de réalité, pas une liste d'ordres.
- Si une optimisation réduit la liberté des agents → la rejeter.

---

## 2. PRÉSENTATION DU PROJET

Jeu web où des joueurs créent des civilisations gérées entièrement par des agents LLM.
Les humains observent : guerres, alliances, famines, découvertes, commerce.
Chaque civilisation a des **valeurs fondatrices** qui influencent ses décisions.

> Projet distinct : **AI Planet** (écosystème de créatures IA) — cahier des charges séparé, ne pas mélanger.

---

## 3. VERSION ACTIVE

| Élément | Valeur |
|---|---|
| Version design | **v3** |
| Prompt LLM actif | `prompt_refonte_complete_v3.md` |
| Tous les autres prompts | **OBSOLÈTES** — ne pas utiliser |

---

## 4. STACK TECHNIQUE

| Composant | Détail |
|---|---|
| Runtime | Node.js |
| Serveur | Express + Socket.io |
| LLM local | Ollama — `mistral-nemo` (12B) recommandé sur 32Go RAM / GPU 16Go VRAM |
| LLM cloud | Gemini Flash ou OpenRouter (quotas limités) |
| Config | `.env` avec `LLM_PROVIDER`, `OLLAMA_URL`, `OLLAMA_MODEL` |
| Appels LLM | **En série uniquement** — 5s délai (cloud) / 1s (local) |

---

## 5. ARCHITECTURE DES DOSSIERS

```
/
├── CLAUDE.md                  ← ce fichier
├── docs/
│   ├── TECH_STACK.md          ← versions, RAM, quotas
│   ├── DESIGN_DECISIONS.md    ← pourquoi chaque choix a été fait
│   ├── SESSION_RECAP.md       ← bilan de la session en cours ( traiter 1 civilisation après l'autre, par ordre alphabétique)
│   └── DEBUG_LEDGER.md        ← historique des bugs et résolutions
├── skills/
│   ├── sim-logic.md           ← moteur de simulation (tick, saisons, moral)
│   ├── llm-prompt.md          ← architecture du prompt LLM
│   ├── map-gen.md             ← génération de carte (Simplex noise, biomes)
    ├── map-data-structure.md  ← gestion des bâtiments
│   ├── ws-events.md           ← événements WebSocket
│   └── civ-actions.md         ← parsing des actions LLM (AFFECTER, CRÉER...)
└── hooks/                     ← scripts de vérification automatique
```déjà o

---

## 6. RÈGLES MÉTIER CRITIQUES

### Simulation
- **1 tick = 1 mois** — 12 ticks = 1 an
- **La terre ne produit RIEN sans travail humain**
- **1 bâtiment par case** — les choix d'aménagement sont réels
- Chaque `CRÉER` = nouvelle structure indépendante sur sa propre case
- **PAS de système de doublons** — le frontend regroupe visuellement (ex: 🌾 Ferme ×3)
- Population de départ : **100** (pas 50)

### Moral
- Frustration cumulative **SANS PLAFOND**
- Si l'IA agit : frustration +0.5/tick au lieu de +1
- Si satisfait : reset à 0
- < 20 : risque de déserteurs

### Valeurs (12)
`expansion` `commerce` `connaissance` `guerre` `spiritualité` `isolationnisme`
`liberté` `ordre` `survie` `exploration` `art` `technologie`
- Satisfaction basée sur **RÉSULTATS objectifs**, pas sur des actions
- Commerce = échange réel avec une autre civ uniquement

### Information entre civs
Toute information doit être **gagnée** : contact frontalier, espionnage, marchands, émissaire, observation lointaine.
Aucune civ ne connaît une autre civ par défaut.

---

## 7. ARCHITECTURE DU PROMPT LLM

Trois couches :
1. **QUI TU ES** (fixe) — identité, valeurs, gouvernement
2. **CE QUE TU PERÇOIS** (narratif, change chaque tick) — pas de chiffres bruts, descriptions qualitatives
3. **CE QUI S'EST PASSÉ** (factuel, non moralisateur)

Puis une **question ouverte** adaptée à l'état de la civ.

Format de réponse attendu :
```
STRATÉGIE : [texte libre]
EFFETS :
- AFFECTER / CRÉER (avec champ "rôle") / ENVOYER / MODIFIER / ABANDONNER
- ESPIONNER / ENVOYER_EMISSAIRE / ENVOYER_MARCHANDS
- DIPLOMATIE / LOI / RIEN
```

---

## 8. PROBLÈMES CONNUS OUVERTS

| Problème | Statut | Notes |
|---|---|---|
| Spirale de la mort (libre=0) | 🔴 À corriger | Prompt doit informer sans suggérer la solution |
| Doublons (système à supprimer) | 🔴 À corriger | Chaque CRÉER = case indépendante |
| Civs qui ne se rencontrent pas | 🟡 En cours | Spawn à 15-25 cases, checkFrontierContact à vérifier |
| IA qui répète "culture des champs" | 🟡 En cours | Lié au prompt + modèle 3B trop faible |
| Cap nourriture ~9999 | 🔴 À supprimer | Si le cap existe dans le code |

---

## 9. CE QUI A ÉTÉ DÉLIBÉRÉMENT SUPPRIMÉ

> Ne pas re-proposer ces éléments sans discussion préalable.

- ❌ **Âges technologiques** — remplacés par découverte libre
- ❌ **Production automatique des biomes** — la terre ne donne rien sans travail
- ❌ **Système de doublons/fusion de structures** — chaque bâtiment est indépendant
- ❌ **Connaissance mutuelle des civs au départ** — toute info doit être gagnée

---

## 10. PROTOCOLE DE FIN DE SESSION

Avant de quitter :
1. Mettre à jour `docs/SESSION_RECAP.md` (dense, économise les tokens)
2. Ajouter les nouveaux bugs à `docs/DEBUG_LEDGER.md`
3. Mettre à jour le skill concerné dans `skills/` si une logique a changé
4. Une fois le recap intégré au code → vider `SESSION_RECAP.md`