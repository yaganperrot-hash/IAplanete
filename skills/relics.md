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

## Spawn

- 10 reliques par world, tirées aléatoirement du pool
- Rayon 15-30 cases autour des civs de départ
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

## Prompt LLM

Section éclaireurs — si civ possède reliques :
```
Reliques en votre possession :
- [nom] : [description]
```

Section last_consequences — découverte :
```
Tes éclaireurs ont découvert : [nom] — [description]
```

Section last_consequences — bonus utilisé :
```
Grâce à [nom], [effet narratif concret].
```
