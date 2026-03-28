# animals.md — Système Animaux (V1)

## Philosophie
Contrainte externe qui génère l'innovation. Aucun chemin imposé.
Les loups attaquent → l'IA découvre qu'elle a besoin d'armes.
Les peaux s'accumulent → l'IA invente un usage via le prompt.

---

## Fichiers

| Fichier | Rôle |
|---|---|
| `backend/src/data/animalsPool.js` | Pool 15 espèces |
| `backend/scripts/migrate.js` | Table `animal_groups` |
| `backend/scripts/civSeed.js` | Spawn 20 groupes |
| `backend/src/simulation/civEngine.js` | `updateAnimalGroups()` |
| `backend/src/simulation/civActionResolver.js` | Résolution CHASSER |
| `backend/src/llm/civOllamaLLM.js` | `getTexteAnimaux()`, CHASSER verbe, questions peaux/os |
| `frontend/src/components/civilisations/CivMap.jsx` | Icônes 🐺🦌🦅 |
| `backend/src/socket/socketManager.js` | Broadcast `animal_groups` |

---

## DB — table `animal_groups`

```sql
id, world_id, nom, species,
type TEXT CHECK('agressif'|'peureux'|'oiseau'),
size INTEGER,
x INTEGER, y INTEGER,
respawn_x INTEGER, respawn_y INTEGER,
dangerosite INTEGER DEFAULT 2,   -- 1 à 5
is_migratory INTEGER DEFAULT 0,
migration_direction TEXT,        -- 'nord'|'sud'|null
discovered_by TEXT DEFAULT '[]', -- JSON array civ_ids
last_attack_tick INTEGER DEFAULT 0
```

Ressources ajoutées : `peaux`, `os` (14 ressources au total désormais)

---

## Types et comportement

| Type | Mouvement | Attaque auto | Chasse |
|---|---|---|---|
| `agressif` | Aléatoire 0-1/tick | Oui si ≤2 cases territoire | Risquée sans armes |
| `peureux` | Fuit territoire (≤3 cases) | Non | Sûre |
| `oiseau` | Aléatoire + migration longue | Non | Possible |

---

## Migration saisonnière

- Printemps → `nord` (+5 cases/tick)
- Automne → `sud` (+5 cases/tick)
- Hors saison → déplacement aléatoire 1 case/tick

---

## Attaques auto (agressif)

Déclenchement : groupe agressif à ≤2 cases d'une case territoire civ.

```
dommage = dangerosite × size × 0.05
50% : réduit production nourriture ce tick
50% : tue floor(dangerosite × 0.5) habitants
Si army_soldiers > 0 OU military_power > 10 → dommages ÷ 2
```

Loggé dans `last_consequences` : `{ type: 'attaque_animaux', nom, morts, description }`

---

## Verbe CHASSER

Format LLM : `CHASSER [nom groupe] personnes:[N]`

**Armes disponibles si** : `army_soldiers > 0` OU `resources.fer > 10` OU `resources.silex > 20`

| Situation | Résultat |
|---|---|
| Avec armes | Gains complets, 0 mort |
| Sans armes + dangerosite ≥ 3 | Gains + morts = floor(dangerosite × N × 0.1) |
| Sans armes + dangerosite < 3 | Gains complets |

**Gains si réussi :**
- `nourriture += size × dangerosite × 2`
- `peaux += size × 1`
- `os += size × 1`
- `group.size = Math.max(0, size - N)`

**Respawn** : si size ≤ 0 → retour à `respawn_x/y`, size remis à `size_min`

---

## Découverte

Si groupe à ≤5 cases d'une case territoire et civ_id absent de `discovered_by` :
→ ajout civ_id + `last_consequences` `{ type: 'animal_decouvert' }`

---

## Prompt LLM

`getTexteAnimaux(ctx)` dans section éclaireurs :
- Agressif proche : *"Une meute de loups rôde à la lisière de ton territoire."*
- Peureux : *"Un troupeau de cerfs paît non loin."*
- Oiseau migrateur : *"Des vols d'oies traversent le ciel vers le nord."*
- Attaque récente : *"Cette nuit, des loups ont tué 2 habitants. Sans armes, tes gardes ont fui."*

`buildDynamicQuestion` — seuils :
- `peaux > 50` → *"Des peaux s'accumulent dans tes réserves. Qu'en fais-tu ?"*
- `os > 50` → *"Des os s'entassent depuis la dernière chasse. Qu'en fait ton peuple ?"*

---

## Spawn

20 groupes par world, rayon 8-20 cases autour des civs de départ.
Respawn au même endroit si chassé à 0 (maintien de ~20 groupes actifs).
