# civ-actions.md — Actions LLM et résolution (Civilisations — Prompt-Free)

## Fichier
`backend/src/simulation/civActionResolver.js`

---

## Flux de résolution (nouvelle archi)

Le LLM Civ produit un texte libre. Le parseur retourne des actions au format :
```js
{ type: 'construire', cible: 'forge', quantite: 5, direction: null,
  description_brute: 'cinq maçons commencent la forge', confiance: 0.85 }
```

Ces actions sont mappées vers les verbes majuscules (CONSTRUIRE, AFFECTER, etc.)
puis résolues par `resolveEffect()`.

---

## Types d'actions connus (parseur → résolveur)

| Type parseur | Verbe résolveur | Description |
|---|---|---|
| `affecter` | AFFECTER | Assigner workers à tâche existante |
| `construire` | CONSTRUIRE | Créer nouveau bâtiment |
| `explorer` | EXPLORER | Envoyer éclaireurs |
| `coloniser` | COLONISER | S'installer dans un territoire |
| `attaquer` | ATTAQUER | Offensive militaire |
| `diplomatie` | DIPLOMATIE | alliance/paix/commerce |
| `envoyer_emissaire` | ENVOYER_EMISSAIRE | Représentants vers civ |
| `envoyer_marchands` | ENVOYER_MARCHANDS | Commerce avec civ |
| `espionner` | ESPIONNER | Espionnage |
| `loi` | LOI | Décret interne (moral ±5) |
| `recruter` | RECRUTER | Enrôler soldats |
| `abandonner` | ABANDONNER | Démanteler structure |
| `chasser` | CHASSER | Chasse groupe animal |
| `utiliser_relique` | UTILISER_RELIQUE | Utiliser relique en possession |
| `etudier_relique` | ETUDIER_RELIQUE | Étudier relique → mémoire |

Types inconnus → loggés dans `unknown_actions` (table DB) pour analyse.

---

## Verbes — détails

### AFFECTER
- `quantite` workers → tâche (`cible`)
- Vérifie `freeLabor` disponible
- Met à jour `buildings[].workers` ou `army_soldiers`

### CONSTRUIRE (→ CRÉER)
- Crée processus `construction` dans `civ_processes`
- Workers réservés pendant la durée
- À la fin : bâtiment ajouté à `buildings[]` avec rôle/capacité propagés
- **Chaque CONSTRUIRE = case indépendante** — pas de fusion
- Coûts : `CREATION_COSTS[catégorie]` en ressources
- Carrière (rôle extraction) coûte bois uniquement (bootstrap depuis 0 pierre possible)

### EXPLORER
- Processus `exploration`
- Workers partis = non disponibles
- Territoire ajouté à la fin si réussie

### ATTAQUER
- Déclare guerre + résout combat immédiat via `resolveWar()`
- Résultat basé sur `military_power`
- Écrit dans `last_consequences` des deux civs
- Insère relation `'guerre'` dans `diplomacy`

### CHASSER
- Chasse groupe animal découvert
- Gains : nourriture + peaux + os selon size × dangerosite
- Sans armes (army=0, fer<10, silex<20) ET dangerosite≥3 → morts possibles

### RECRUTER
- Converti en `AFFECTER N → armée` par `actionToEffetLine()`
- Traité par le case AFFECTER (détection `/arm[eé]e|soldat|recrut/i`)
- Transfère N personnes de `population` vers `army_soldiers`
- Recalcule `military_power` via `getMilitaryPower()`

### UTILISER_RELIQUE
- Cherche relique : `taken=1 AND used=0 AND name LIKE %cible%`
- Marque `used=1` dans DB
- Bonus moral selon `domain` : arme +5 (+5 soldats), art +15, ruines +10, outil +8
- Écrit `{ type: 'relique_utilisee' }` dans `last_consequences`
- Mémoire `histoire` : "Relique utilisée : X"

### ETUDIER_RELIQUE
- Cherche relique : `taken=1 AND used=0` — **ne la consomme pas**
- +5 moral
- Mémoire `savoir` : "An Y — Relique étudiée : X (domain)"
- Écrit `{ type: 'relique_etudiee' }` dans `last_consequences`

### LOI
- Effet moral : ±5

### RIEN
- Frustration +1/tick sur valeurs non satisfaites

---

## buildCivContext — champs disponibles dans ctx

```js
{
  // Identité
  nom, gouvernement, description, valeurs, prompt_variant,

  // Population
  population, housed, homeless, homeless_deaths, population_trend,
  free_workforce,

  // Ressources
  resources, resourceBilan,   // bilan par ressource : { stock, production, consumption, balance }
  food_famine_in,             // ticks avant famine (null si ok)

  // Territoire
  territory_count, territory_used, territory_free,
  territory_biomes,           // top biomes du territoire
  known_deposits,             // gisements repérés

  // Bâtiments et processus
  structures,                 // bâtiments actifs avec prod_per_tick
  active_processes,           // chantiers/missions en cours

  // Militaire
  army_soldiers, army_power,

  // Moral
  moral, moralLabel,
  frustration_ticks,          // { valeur: nbTicks }
  satisfactions,              // valeurs satisfaites ce tick

  // Diplomatie
  neighbors,                  // civs connues : { nom, relation, military_power, population }

  // Événements
  last_consequences,          // événements tick précédent
  active_events,

  // Mémoire
  civ_memory,                 // JSON string : { identite, savoir, histoire, diplomatie, pressions }
  memoire,                    // ancien cap stratégique (legacy)

  // Prompt-Free
  echecs_tick_precedent,      // [{ intention, raison, ressource_manquante, besoin, dispo, ... }]
  reliques_mystere,           // reliques taken=1 AND used=0
  reliques_used,              // reliques used=1 (pour describeTechnology)
  reliques_decouvertes,       // reliques découvertes non prises
  relics,                     // toutes les reliques liées à la civ

  // Animaux
  animal_groups,              // groupes dans le territoire

  // Saison
  season, month_name, year, tick,

  // Narratif (prompt-free)
  last_narrative,             // texte brut du dernier tick LLM (string)
}
```

---

## Échecs (prompt-free)

Quand une action est rejetée, un objet est ajouté à `echecsDuTick[]` :
```js
{
  intention: "description_brute de l'action",
  raison: 'ressource_manquante' | 'population_insuffisante' | 'main_oeuvre_nulle' | 'cible_inconnue' | 'defaut',
  ressource_manquante: 'bois' | null,
  besoin: 50 | null,
  dispo: 10 | null,
  population_dispo: 5 | null,
  cible: 'nom civ' | null
}
```

Stocké dans `civilizations.last_echecs` (JSON) à la fin du tick.
Lu au tick suivant via `echecs_tick_precedent` dans `buildCivContext`.
Affiché dans le prompt narratif par `buildEchecsNarratif()`.
