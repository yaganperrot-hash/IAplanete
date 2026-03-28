# ws-events.md — Événements WebSocket (Civilisations)

## Fichier serveur
`backend/src/socket/socketManager.js`

## Fichier client
`frontend/src/hooks/useCivSocket.js`

---

## Événements serveur → client

### `civ:tick:update`
Émis à chaque fin de tick par `civEngine._broadcast()`.
```js
{
  tick: number,
  year: number,
  season: 'printemps' | 'ete' | 'automne' | 'hiver',
  monthName: string,
  civs: [{
    id, nom, color, creator_name,
    population, moral,
    resources: { nourriture, bois, pierre, ... },
    army_soldiers,
    territory_count, status,
    gouvernement, valeurs: string[],
    capital_x, capital_y,
    buildings: BuildingObject[],
    last_consequences: string[],
    military_power,
  }],
  territories: [{ civ_id, x, y }],
  new_events: Event[],
  recent_events: Event[],   // 30 derniers
  thought_logs: ThoughtLog[], // 20 derniers
}
```

### `civ:world:init`
Émis en réponse à `request:civ:init`. État complet du monde.
```js
{
  worldId, tick, civs, territories, biomes,
  recent_events, thought_logs
}
// ou { error: string } si monde non initialisé
```

### `world:init`
Monde AI Planet (pas Civilisations). Réponse à `request:world`.

### `species:update`
Espèces AI Planet. Réponse à `request:species`.

---

## Événements client → serveur

### `request:civ:init`
Demande l'état initial du monde Civilisations.

### `request:species`
Demande la liste des espèces AI Planet.

### `disconnect`
Géré automatiquement par Socket.io.

---

## Types d'événements (champ `type` dans Event)

| Type | Description |
|---|---|
| `catastrophe` | Sécheresse, inondation, tempête, incendie, grand froid |
| `epidemie` | Épidémie de maladie |
| `bonus` | Bonne récolte |
| `famine` | Stock nourriture = 0 |
| `effondrement` | Civilisation morte (pop = 0) |
| `revolte` | Moral < 20, déserteurs |
| `construction` | Bâtiment terminé |
| `exploration` | Éclaireurs rentrés |
| `mission` | Mission diplomatique terminée |
| `espionnage` | Succès ou échec espionnage |
| `echec` | Mission ratée |
| `commerce` | Échange commercial réussi |
| `diplomatie` | Contact/alliance établi |
| `decouverte` | Nouvelle civ découverte (brouillard de guerre) |

### Structure Event
```js
{
  type: string,
  description: string,
  civ_ids: number[],   // civs concernées (alias species_ids en DB)
}
```

---

## ThoughtLog (journal de décisions LLM)
```js
{
  civ_id, world_id, tick,
  actions: string[],   // verbes parsés ['AFFECTER', 'CRÉER', ...]
  raison: string,      // texte STRATÉGIE
}
```
