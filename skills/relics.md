# relics.md — Système de Reliques (V1)

## Philosophie
Objets / œuvres / constructions découverts via l'exploration.
Décrits narrativement — l'IA décide seule quoi en faire.
Bonus uniquement si l'IA agit de manière cohérente avec le domaine de la relique.
Aucune option suggérée dans le prompt.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `backend/src/data/relicsPool.js` | Pool de 20 reliques pré-écrites |
| `backend/scripts/migrate.js` | Table `relics` |
| `backend/scripts/civSeed.js` | Spawn 10 reliques à la génération |
| `backend/src/simulation/civActionResolver.js` | `discoverRelicsInTerritory()` |
| `backend/src/simulation/civEngine.js` | `processRelicUsage()`, `applyRelicBonuses()` |
| `backend/src/llm/civOllamaLLM.js` | `getTexteReliques()`, attribution bonus dans last_consequences |
| `frontend/src/components/civilisations/CivCard.jsx` | Section Reliques (icônes 👜✨) |
| `frontend/src/components/civilisations/CivMap.jsx` | Marqueur 🏺 sur la carte |
| `backend/src/socket/socketManager.js` | Champ `relics` dans broadcast |

---

## DB — table `relics`

```sql
id, world_id, name, description,
type TEXT CHECK(objet|art|construction),
domain TEXT CHECK(outil|arme|art|ruines),
x INTEGER, y INTEGER,
discovered_by INTEGER (civ_id, nullable),
discovered_at_tick INTEGER (nullable),
taken INTEGER DEFAULT 0,    -- 1 si objet/art emporté
used INTEGER DEFAULT 0,     -- 1 si bonus déclenché
bonus_remaining INTEGER     -- ticks restants pour bonus durée limitée
```

---

## Types et comportement

| Type | Comportement | Exemple |
|---|---|---|
| `objet` | Emporté (`taken=1`) à la découverte | Houe obsidienne, lame gravée |
| `art` | Emporté (`taken=1`) | Fresque sur pierre |
| `construction` | Reste sur place (`taken=0`) | Fondations, ruines |

---

## Domaines et bonus (si utilisation cohérente)

| Domaine | Actions cohérentes | Bonus |
|---|---|---|
| `outil` | CONSTRUIRE agriculture/extraction/production | +10% nourriture |
| `arme` | AFFECTER → armée, CONSTRUIRE militaire | +5% puissance militaire |
| `art` | LOI, CONSTRUIRE savoir/religieux | +5 moral (unique) |
| `ruines` | ENVOYER_EMISSAIRE, ENVOYER_MARCHANDS, CONSTRUIRE savoir/commerce | +10% bois |

---

## Détection utilisation (Option B)

Pas de parsing texte. Matching par type d'action LLM vs domaine relique.
Si match → `used = 1` + bonus appliqué + message dans `last_consequences` avec attribution explicite :
> *"Grâce à [nom relique], [effet concret narratif]."*

Le LLM voit ce message au tick suivant → comprend la causalité relique/résultat.

---

## Niveaux technologiques (era)

Chaque relique a un champ `era` (`primitif` / `metal` / `avance`).
Le niveau de la civ est déterminé par `getCivEra(civ)` dans `civActionResolver.js` :
- `avance` : fer > 0 OU or > 0 OU charbon > 0 en stock
- `metal` : cuivre > 0 OU étain > 0 OU bâtiment forge/fonderie
- `primitif` : sinon

Distribution du pool : 10 primitif / 5 metal / 5 avance.

### Règles de découverte (`discoverRelicsInTerritory`)

| diff (relique - civ) | Comportement |
|---|---|
| 0 ou négatif | Découverte normale — bonus mécanique possible |
| +1 | Relique incomprise — message narratif inspirant + entrée mémoire `savoir`, pas de bonus |
| +2 | Ignorée — reste `discovered_by = NULL` |

Conséquence `relique_incomprise` gérée dans `getTexteConsequencesReliques` (Ollama + Gemini).

## Spawn

- 10 reliques par world, tirées aléatoirement du pool
- Rayon 5-12 cases autour des civs de départ
- Évite les cases océaniques et déjà occupées
- `discovered_by = NULL` jusqu'à exploration

---

## Découverte

`discoverRelicsInTerritory()` est appelée dans 3 situations :
1. Fin d'une exploration (`civEngine.js`) — exploration terminée
2. Auto-expansion territoriale (`civEngine.js`) — densité pop/territoire
3. Colonisation (`civActionResolver.js` ligne ~728) — nouvelles cases acquises

Vérifie reliques non découvertes dans le nouveau territoire → injecte `relique_decouverte` dans `last_consequences`

---

## Prompt LLM — placement

Section reliques affichée **juste avant la question finale** (`Que décides-tu ?`) dans les deux LLM.
Filtre : `used=0, taken=1` (reliques en possession non encore utilisées).
Si aucune relique éligible : section omise.

### Section éclaireurs — si civ possède reliques (ancien emplacement, remplacé)
```
Reliques en votre possession :
- [nom] : [description]
```

Section last_consequences — types gérés :
```
Tes éclaireurs ont découvert : [nom] — [description]
```

Section last_consequences — bonus utilisé :
```
Grâce à [nom], [effet narratif concret].
```

⚠️ `processRelicUsage` écrit `relique_utilisee` en DB dans Étape 1. Grâce au **merger** last_consequences (fix 2026-03-29), cet objet survit jusqu'à Étape 3 et est visible du LLM.
