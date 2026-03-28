# map-gen.md — Génération de carte (Civilisations)

## Fichier
`backend/src/simulation/mapGenerator.js`

## Configuration
```js
MAP_CONFIG = {
  width: 256, height: 192,          // 49 152 cases
  continentScale: 3,                 // basses fréquences → grands continents
  detailScale: 8,                    // hautes fréquences → côtes découpées
  continentWeight: 0.6, detailWeight: 0.4,
  borderFalloff: 28,                 // masque de bord → océan forcé
  elevationPower: 1.2,               // >1 = plus d'eau
  seaLevel: 0.38,
  deepSeaLevel: 0.25,
  reefLevel: 0.35,
  coastLevel: 0.41,
  hillLevel: 0.75,
  mountainLevel: 0.85,
  volcanoCount: 6,
  minIslandSize: 8,                  // micro-îles → supprimées
  minLakeSize: 12,                   // micro-lacs → supprimés
  minLandRatio: 0.30, minWaterRatio: 0.30,
  defaultSeed: 42,
}
```

## Pipeline de génération (4 passes)

### Passe 1 : Élévation
- PRNG seedable `makePRNG(seed)` (xorshift32, déterministe)
- Deux couches Simplex Noise :
  - Continents (FBM 2 octaves, basse fréquence)
  - Détails (FBM 4 octaves, haute fréquence)
- Masque de bordure (`borderFalloff`) → océan sur les bords
- Courbe de puissance (`elevationPower`) → contraste terre/mer
- Normalisation → [0, 1]

### Passe 2 : Climat
- Température : latitude (distance équateur) + bruit ×0.15
- Humidité : bruit + bonus proximité eau

### Passe 3 : Biomes (assignBiome)
Matrice élévation × température × humidité :

| Élévation | Biome |
|---|---|
| < deepSeaLevel (0.25) | ocean_deep |
| < reefLevel (0.35) | reef (si humid > 0.5) / ocean_deep |
| < seaLevel (0.38) | coast |
| < coastLevel (0.41) | coast |
| > mountainLevel (0.85) | mountain |
| > hillLevel (0.75) | hills |
| Terrestre | matrice temp × humid |

Matrice terrestre (temp / humid) :
- temp < 0.2 : tundra / desert_cold
- temp < 0.4 : tundra / prairie / temperate_forest / swamp
- temp < 0.65 : desert_hot / savanna / hills / temperate_forest / swamp
- temp ≥ 0.65 : desert_hot / savanna / hills / tropical_forest / swamp

### Volcans
`placeVolcanoes()` : remplace des cases `mountain` par `volcano` (espacés ≥ 15 cases).

### Nettoyage post-génération
1. Micro-îles (< minIslandSize) → coast ou ocean_deep
2. Micro-lacs (< minLakeSize) → biome voisin terrestre
3. Vérification ratio terre/eau (warning si hors limites)

---

## Gisements minéraux (spawnDeposits)

| Minéral | Biomes éligibles | Probabilité | Qté min-max |
|---|---|---|---|
| cuivre | hills, mountain | 8% | 5-15 |
| etain | hills, mountain | 6% | 3-10 |
| fer | mountain | 5% | 3-12 |
| or | mountain, hills | 3% | 2-6 |
| charbon | hills, temperate_forest, mountain | 5% | 4-14 |

Garantie : minimum 3 gisements par minéral si biomes éligibles existent.

---

## Données par cellule
```js
{
  x, y,
  biome_type: string,
  food_level: number,   // potentiel agricole du biome (jamais auto-produit)
  water_level: number,
  temperature: number,
  deposits: [{ type: string, amount: number }]
}
```

## Export
```js
module.exports = {
  generateMap,        // (seed) → { cells, width, height }
  getLandCells,       // filtre ocean_deep/ocean/reef
  getOceanCells,      // filtre coast inclus
  getCellsByBiome,    // filtre par type
  MAP_WIDTH: 256,
  MAP_HEIGHT: 192,
}
```
