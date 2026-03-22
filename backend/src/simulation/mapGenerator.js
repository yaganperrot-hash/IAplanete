// Génère une carte avec Simplex Noise + FBM (Fractional Brownian Motion)
// 100% déterministe : même seed → même carte

const SimplexNoise = require('simplex-noise');

// ─── Configuration ────────────────────────────────────────────────────────────
const MAP_CONFIG = {
  width: 256,
  height: 192,
  continentScale: 3,     // fréquence de base des continents (bas = gros blobs)
  detailScale: 8,        // fréquence des détails côtiers (haut = plus découpé)
  continentWeight: 0.6,  // poids couche continent
  detailWeight: 0.4,     // poids couche détail
  borderFalloff: 28,     // largeur du masque de bordure en cellules (proportionnel à 256)
  elevationPower: 1.2,   // contraste terre/mer (>1 = plus d'eau)
  seaLevel: 0.38,        // seuil terre/mer principal
  deepSeaLevel: 0.25,    // seuil océan profond
  reefLevel: 0.35,       // seuil récifs (entre deepSea et seaLevel)
  coastLevel: 0.41,      // seuil côte (juste au-dessus de seaLevel)
  hillLevel: 0.75,       // seuil collines
  mountainLevel: 0.85,   // seuil montagne
  volcanoCount: 6,       // nb de volcans placés aléatoirement
  minIslandSize: 8,      // supprimer îles < X cellules
  minLakeSize: 12,       // supprimer lacs orphelins < X cellules
  minLandRatio: 0.30,    // au moins 30% de terre
  minWaterRatio: 0.30,   // au moins 30% d'eau
  defaultSeed: 42,
};

// ─── Ressources initiales par biome ──────────────────────────────────────────
const BIOME_FOOD = {
  tropical_forest: 90, temperate_forest: 70, savanna: 55,
  desert_hot: 10, desert_cold: 10, mountain: 20,
  hills: 65, volcano: 5, swamp: 40, coast: 35,
  reef: 85, ocean_deep: 20, prairie: 80, tundra: 12,
  ocean: 30,
};

const BIOME_WATER = {
  tropical_forest: 90, temperate_forest: 70, savanna: 20,
  desert_hot: 5, desert_cold: 15, mountain: 50,
  hills: 55, volcano: 10, swamp: 95, coast: 55,
  reef: 100, ocean_deep: 100, prairie: 45, tundra: 30,
  ocean: 100,
};

const BIOME_TEMP = {
  tropical_forest: 30, temperate_forest: 15, savanna: 28,
  desert_hot: 40, desert_cold: -15, mountain: 5,
  hills: 18, volcano: 45, swamp: 25, coast: 20,
  reef: 22, ocean_deep: 8, prairie: 20, tundra: -10,
  ocean: 10,
};

// ─── PRNG seedable (xorshift32) ──────────────────────────────────────────────
function makePRNG(seed) {
  let state = (seed ^ 0xdeadbeef) >>> 0;
  if (state === 0) state = 1;
  return function () {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// ─── FBM (Fractional Brownian Motion) ────────────────────────────────────────
function fbm(noiseFn, x, y, octaves = 4) {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxValue = 0;
  for (let i = 0; i < octaves; i++) {
    value += noiseFn(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / maxValue; // [-1, 1]
}

// ─── Passe 1 : Élévation ─────────────────────────────────────────────────────
function generateElevation(width, height, seed, cfg) {
  const prng1 = makePRNG(seed);
  const prng2 = makePRNG(seed + 999);

  const continentSimplex = new SimplexNoise(prng1);
  const detailSimplex = new SimplexNoise(prng2);

  const continentFn = (x, y) => continentSimplex.noise2D(x, y);
  const detailFn = (x, y) => detailSimplex.noise2D(x, y);

  const elevation = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;

      // Couche continents : basses fréquences → grandes formes
      const continent = fbm(continentFn, nx * cfg.continentScale, ny * cfg.continentScale, 2);

      // Couche détails : hautes fréquences → côtes découpées, îles
      const detail = fbm(detailFn, nx * cfg.detailScale, ny * cfg.detailScale, 4);

      // Combinaison normalisée vers [0, 1]
      let elev = (continent * cfg.continentWeight + detail * cfg.detailWeight) * 0.5 + 0.5;

      // Masque de bordure : force l'océan sur les bords
      const borderDist = Math.min(x, y, width - 1 - x, height - 1 - y);
      const borderMask = Math.min(borderDist / cfg.borderFalloff, 1);
      elev *= borderMask;

      // Courbe de puissance : accentue le contraste terre/mer
      elev = Math.pow(Math.max(0, elev), cfg.elevationPower);

      elevation[y * width + x] = elev;
    }
  }

  return elevation;
}

// ─── Passe 2 : Température & Humidité ────────────────────────────────────────
function generateClimate(width, height, elevation, seed, cfg) {
  const prng3 = makePRNG(seed + 1337);
  const climateSimplex = new SimplexNoise(prng3);
  const climateFn = (x, y) => climateSimplex.noise2D(x, y);

  const temperature = new Float32Array(width * height);
  const humidity = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      const idx = y * width + x;
      const elev = elevation[idx];

      // Température : latitude (distance à l'équateur) + bruit léger
      const latitude = Math.abs(y - height / 2) / (height / 2);
      const tempNoise = fbm(climateFn, nx * 4, ny * 4, 2) * 0.15;
      temperature[idx] = Math.max(0, Math.min(1, 1 - latitude * 0.9 + tempNoise));

      // Humidité : bruit + bonus proximité eau
      let humid = fbm(climateFn, nx * 6 + 10, ny * 6 + 10, 3) * 0.5 + 0.5;
      if (elev < cfg.seaLevel) humid += 0.2; // plus humide près de l'eau
      humidity[idx] = Math.max(0, Math.min(1, humid));
    }
  }

  return { temperature, humidity };
}

// ─── Passe 3 : Assignation des biomes ────────────────────────────────────────
function assignBiome(elev, temp, humid, cfg) {
  if (elev < cfg.deepSeaLevel) return 'ocean_deep';
  if (elev < cfg.reefLevel)    return humid > 0.5 ? 'reef' : 'ocean_deep';
  if (elev < cfg.seaLevel)     return 'coast';
  if (elev < cfg.coastLevel)   return 'coast';
  if (elev > cfg.mountainLevel) return 'mountain';
  if (elev > cfg.hillLevel)    return 'hills';

  // Biomes terrestres : matrice température × humidité
  if (temp < 0.2) {
    return humid < 0.4 ? 'tundra' : 'desert_cold';
  }
  if (temp < 0.4) {
    if (humid < 0.25) return 'tundra';
    if (humid < 0.5)  return 'prairie';
    if (humid < 0.75) return 'temperate_forest';
    return 'swamp';
  }
  if (temp < 0.65) {
    if (humid < 0.2)  return 'desert_hot';
    if (humid < 0.4)  return 'savanna';
    if (humid < 0.6)  return 'hills';
    if (humid < 0.8)  return 'temperate_forest';
    return 'swamp';
  }
  // Zone chaude
  if (humid < 0.2)  return 'desert_hot';
  if (humid < 0.4)  return 'savanna';
  if (humid < 0.55) return 'hills';
  if (humid < 0.75) return 'tropical_forest';
  return 'swamp';
}

// ─── Gisements minéraux ───────────────────────────────────────────────────────
const DEPOSIT_SPAWN = {
  cuivre:  { biomes: ['hills', 'mountain'],                         probability: 0.08, min: 5,  max: 15 },
  etain:   { biomes: ['hills', 'mountain'],                         probability: 0.06, min: 3,  max: 10 },
  fer:     { biomes: ['mountain'],                                  probability: 0.05, min: 3,  max: 12 },
  or:      { biomes: ['mountain', 'hills'],                         probability: 0.03, min: 2,  max: 6  },
  charbon: { biomes: ['hills', 'temperate_forest', 'mountain'],     probability: 0.05, min: 4,  max: 14 },
};

function spawnDeposits(cells, seed) {
  const rng = makePRNG(seed + 9999);

  // Init deposits for all cells
  for (const cell of cells) cell.deposits = [];

  for (const [mineral, cfg] of Object.entries(DEPOSIT_SPAWN)) {
    const eligible = cells.filter(c => cfg.biomes.includes(c.biome_type));
    let placed = 0;

    for (const cell of eligible) {
      if (rng() < cfg.probability) {
        const amount = Math.floor(rng() * (cfg.max - cfg.min + 1)) + cfg.min;
        cell.deposits.push({ type: mineral, amount });
        placed++;
      }
    }

    // Guarantee at least 3 deposits per mineral if map has eligible biomes
    const minDeposits = 3;
    if (placed < minDeposits && eligible.length > 0) {
      const needed = minDeposits - placed;
      for (let i = 0; i < needed; i++) {
        const idx = Math.floor(rng() * eligible.length);
        const cell = eligible[idx];
        if (!cell.deposits.some(d => d.type === mineral)) {
          const amount = Math.floor(rng() * (cfg.max - cfg.min + 1)) + cfg.min;
          cell.deposits.push({ type: mineral, amount });
          placed++;
        }
      }
    }

    console.log(`[mapGenerator] Gisements ${mineral}: ${placed} cases`);
  }

  return cells;
}

// ─── Placement des volcans ────────────────────────────────────────────────────
function placeVolcanoes(width, height, elevation, biomeGrid, count, seed, cfg) {
  const rng = makePRNG(seed + 7777);
  // Collecter les cellules de montagne
  const mountainCells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (biomeGrid[y * width + x] === 'mountain') {
        mountainCells.push({ x, y });
      }
    }
  }
  if (mountainCells.length === 0) return;

  // Placer les volcans dans des montagnes, espacés d'au moins 15 cellules
  const placed = [];
  let attempts = 0;
  while (placed.length < count && attempts < 500) {
    attempts++;
    const idx = Math.floor(rng() * mountainCells.length);
    const { x, y } = mountainCells[idx];
    const tooClose = placed.some(p => Math.abs(p.x - x) + Math.abs(p.y - y) < 15);
    if (!tooClose) {
      placed.push({ x, y });
      biomeGrid[y * width + x] = 'volcano';
    }
  }
}

// ─── Flood fill utilitaire ───────────────────────────────────────────────────
function floodFill(x, y, width, height, visited, predicate) {
  const stack = [{ x, y }];
  const cells = [];
  while (stack.length > 0) {
    const { x: cx, y: cy } = stack.pop();
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
    const idx = cy * width + cx;
    if (visited[idx]) continue;
    if (!predicate(cx, cy)) continue;
    visited[idx] = true;
    cells.push({ x: cx, y: cy });
    stack.push({ x: cx + 1, y: cy }, { x: cx - 1, y: cy }, { x: cx, y: cy + 1 }, { x: cx, y: cy - 1 });
  }
  return cells;
}

// ─── Nettoyage post-génération ────────────────────────────────────────────────
function cleanup(width, height, biomeGrid, elevation, cfg) {
  const OCEAN_BIOMES = new Set(['ocean_deep', 'reef']);
  const LAND_BIOMES  = new Set(['coast', 'prairie', 'savanna', 'hills', 'temperate_forest',
    'tropical_forest', 'swamp', 'desert_hot', 'desert_cold', 'tundra', 'mountain', 'volcano']);

  const isOcean = (x, y) => OCEAN_BIOMES.has(biomeGrid[y * width + x]);
  const isLand  = (x, y) => LAND_BIOMES.has(biomeGrid[y * width + x]);

  // ── 1. Supprimer les micro-îles (< minIslandSize cellules) ─────────────────
  {
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && isLand(x, y)) {
          const region = floodFill(x, y, width, height, visited, isLand);
          if (region.length < cfg.minIslandSize) {
            // Convertir en biome côtier ou océan selon élévation
            for (const { x: rx, y: ry } of region) {
              const e = elevation[ry * width + rx];
              biomeGrid[ry * width + rx] = e < cfg.seaLevel + 0.05 ? 'coast' : 'ocean_deep';
            }
          }
        }
      }
    }
  }

  // ── 2. Supprimer les micro-lacs intérieurs (< minLakeSize cellules) ─────────
  {
    const visited = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!visited[idx] && isOcean(x, y)) {
          const region = floodFill(x, y, width, height, visited, isOcean);
          if (region.length < cfg.minLakeSize) {
            // Convertir en biome terrestre basé sur les voisins
            for (const { x: rx, y: ry } of region) {
              // Chercher un biome voisin terrestre
              let neighborBiome = 'prairie';
              for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
                const nx = rx + dx, ny = ry + dy;
                if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                  const b = biomeGrid[ny * width + nx];
                  if (LAND_BIOMES.has(b)) { neighborBiome = b; break; }
                }
              }
              biomeGrid[ry * width + rx] = neighborBiome;
            }
          }
        }
      }
    }
  }

  // ── 3. Vérifier ratio terre/eau (avertissement, pas de régénération) ────────
  let landCount = 0;
  let totalCount = width * height;
  for (let i = 0; i < totalCount; i++) {
    if (LAND_BIOMES.has(biomeGrid[i])) landCount++;
  }
  const landRatio = landCount / totalCount;
  const waterRatio = 1 - landRatio;
  if (landRatio < cfg.minLandRatio) {
    console.warn(`[mapGenerator] Attention : ratio terre=${(landRatio*100).toFixed(1)}% < ${cfg.minLandRatio*100}% minimum`);
  }
  if (waterRatio < cfg.minWaterRatio) {
    console.warn(`[mapGenerator] Attention : ratio eau=${(waterRatio*100).toFixed(1)}% < ${cfg.minWaterRatio*100}% minimum`);
  }
  console.log(`[mapGenerator] Ratio terre=${(landRatio*100).toFixed(1)}% eau=${(waterRatio*100).toFixed(1)}%`);
}

// ─── Normalisation de l'élévation vers [0, 1] ────────────────────────────────
function normalizeElevation(elevation) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] < min) min = elevation[i];
    if (elevation[i] > max) max = elevation[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < elevation.length; i++) {
    elevation[i] = (elevation[i] - min) / range;
  }
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────
function generateMap(seed) {
  const cfg = MAP_CONFIG;
  const { width, height } = cfg;
  const usedSeed = (seed !== undefined && seed !== null) ? Number(seed) : cfg.defaultSeed;

  console.log(`[mapGenerator] Génération carte ${width}×${height} seed=${usedSeed}`);

  // Passe 1 : élévation
  const elevation = generateElevation(width, height, usedSeed, cfg);

  // Normalisation : garantit que les seuils de biomes sont toujours atteints
  normalizeElevation(elevation);

  // Passe 2 : climat
  const { temperature, humidity } = generateClimate(width, height, elevation, usedSeed, cfg);

  // Passe 3 : biomes
  const biomeGrid = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      biomeGrid[idx] = assignBiome(elevation[idx], temperature[idx], humidity[idx], cfg);
    }
  }

  // Placement volcans
  placeVolcanoes(width, height, elevation, biomeGrid, cfg.volcanoCount, usedSeed, cfg);

  // Nettoyage
  cleanup(width, height, biomeGrid, elevation, cfg);

  // Construire le tableau de cellules (même format qu'avant)
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const biomeType = biomeGrid[idx];
      cells.push({
        x,
        y,
        biome_type: biomeType,
        food_level:  BIOME_FOOD[biomeType]  ?? 30,
        water_level: BIOME_WATER[biomeType] ?? 30,
        temperature: BIOME_TEMP[biomeType]  ?? 15,
        deposits: [],
      });
    }
  }

  // Placer les gisements minéraux
  spawnDeposits(cells, usedSeed);

  return { cells, width, height };
}

// ─── Helpers exportés (même API qu'avant) ─────────────────────────────────────
function getLandCells(cells) {
  return cells.filter(c => !['ocean_deep', 'ocean', 'reef'].includes(c.biome_type));
}

function getOceanCells(cells) {
  return cells.filter(c => ['ocean_deep', 'ocean', 'reef', 'coast'].includes(c.biome_type));
}

function getCellsByBiome(cells, biomeTypes) {
  return cells.filter(c => biomeTypes.includes(c.biome_type));
}

module.exports = {
  generateMap,
  getLandCells,
  getOceanCells,
  getCellsByBiome,
  MAP_WIDTH: MAP_CONFIG.width,
  MAP_HEIGHT: MAP_CONFIG.height,
};
