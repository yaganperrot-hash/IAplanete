# map-data-structure.md — Structures de données (Bâtiments & Territoire)

## Bâtiments (buildings)

### Stockage
Colonne `buildings TEXT` dans `civilizations` — JSON array.

### Format d'un bâtiment
```js
{
  name: string,           // nom libre donné par l'IA
  category: string,       // catégorie de production (voir ci-dessous)
  role: string,           // rôle fonctionnel (habitation, défense...)
  workers: number,        // personnes affectées (0 si inactif)
  status: 'active' | 'en_construction',
  capacity: number,       // pour role=habitation (défaut 20)
  prod_per_tick: number,  // calculé à partir de PRODUCTION_RATES × workers
  production: string,     // ressource produite
}
```

### Catégories (PRODUCTION_RATES)
| Catégorie | Ressource | Taux/travailleur |
|---|---|---|
| agriculture | nourriture | 2.0 |
| chasse | nourriture | 1.0 |
| peche | nourriture | 1.2 |
| maritime | nourriture | 1.5 |
| bois | bois | 1.5 |
| extraction | pierre | 1.0 |
| mine_cuivre | cuivre | 0.3 |
| mine_fer | fer | 0.2 |
| mine_or | or | 0.1 |
| mine_charbon | charbon | 0.3 |
| production | fer | 0.5 |
| commerce | or | 0.2 |
| habitation | (rien) | 0 |
| autre | nourriture | 0.3 |

### Règles critiques
- **1 bâtiment par case** — chaque `CRÉER` = entrée distincte dans le tableau
- **PAS de fusion/doublons** — le frontend regroupe visuellement (🌾 Ferme ×3)
- Bâtiment `en_construction` : processus dans `civ_processes`, workers réservés

### normalizeBuildings(raw)
```js
// Convertit string legacy → objet complet
// Fichiers : moralSystem.js, civActionResolver.js
```

---

## Territoire (territories)

### Table SQL
```sql
territories (id, world_id, civ_id, x, y)
```

### Règles
- 1 case = 1 entrée (pas de doublons x/y pour une même civ)
- `territory_count` dans `civilizations` = cache du COUNT(*)
- Auto-expansion : si `pop / territory_count > 50` → +N cases/tick

### initTerritory(civ, biomesMap, worldId)
Initialise le territoire de départ (rayon autour de la capitale).

### expandTerritory(civ, direction, biomesMap, worldId, count)
Ajoute des cases adjacentes dans une direction, en évitant les océans et les territoires adverses.

---

## Processus (civ_processes)

### Table SQL
```sql
civ_processes (
  id, world_id, civ_id,
  type,             -- 'construction' | 'exploration' | 'mission'
  resolve_type,     -- 'espionnage' | 'commerce_expedition' | 'emissaire'
  target,           -- nom du bâtiment ou destination
  target_civ_id,    -- pour missions diplomatiques
  workers,          -- personnes mobilisées
  ticks_remaining,  -- décompte
  max_ticks,        -- durée initiale
  progress,         -- max_ticks - ticks_remaining
  role,             -- propagé au bâtiment terminé
  capacity,         -- propagé au bâtiment terminé (habitation)
  state             -- 'en_cours' | 'terminé'
)
```

---

## Diplomatie (diplomacy)

### Table SQL
```sql
diplomacy (world_id, civ_a_id, civ_b_id, relation)
-- relation : 'neutre' | 'amical' | 'allié' | 'guerre'
-- civ_a_id < civ_b_id (tri pour unicité)
```

---

## Connaissances inter-civs

### Colonne `discovered_civ_ids TEXT` (JSON array d'ids)
Civs que cette civ a découvertes (via frontière, espionnage, émissaire...).

### Colonne `knowledge_about TEXT` (JSON objet)
Informations gagnées sur d'autres civs :
```js
{
  [civ_id]: {
    nom, population_approx, military_approx, capital_location, ...
  }
}
```
