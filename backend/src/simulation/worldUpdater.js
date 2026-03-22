// Mise à jour du monde à chaque tick (climat, végétation, eau, catastrophes, précipitations)

const SEASONS = ['printemps', 'été', 'automne', 'hiver'];

const BIOME_REGEN = {
  tropical_forest: 4, temperate_forest: 2, savanna: 2,
  desert_hot: 0.3, desert_cold: 0.2, mountain: 0.5,
  hills: 2.5, volcano: 0.1, swamp: 1.5, coast: 1,
  reef: 3, ocean_deep: 0.5, prairie: 3, tundra: 0.3,
};

const BIOME_WATER_REGEN = {
  tropical_forest: 3, temperate_forest: 2, savanna: 0.5,
  desert_hot: 0.1, desert_cold: 0.5, mountain: 1,
  hills: 1.5, volcano: 0.2, swamp: 4, coast: 2,
  reef: 5, ocean_deep: 5, prairie: 1.5, tundra: 0.5,
};

// Précipitations de base par biome (0–100)
const BIOME_BASE_PRECIP = {
  tropical_forest: 85, temperate_forest: 65, savanna: 30,
  desert_hot: 5, desert_cold: 10, mountain: 50,
  hills: 55, volcano: 20, swamp: 80, coast: 60,
  reef: 70, ocean_deep: 75, prairie: 40, tundra: 35,
};

// Modificateur de régénération par saison
function getSeasonModifier(season, biome) {
  switch (season) {
    case 'été':
      if (['tropical_forest', 'savanna', 'prairie'].includes(biome)) return 1.5;
      if (['desert_hot'].includes(biome)) return 0.5;
      return 1.2;
    case 'hiver':
      if (['tundra', 'desert_cold', 'mountain'].includes(biome)) return 0.1;
      if (['tropical_forest', 'reef'].includes(biome)) return 0.9;
      return 0.4;
    case 'automne':
      return 0.8;
    case 'printemps':
      return 1.3;
    default:
      return 1;
  }
}

// Précipitations déterministes : base biome × modificateur saison (pas de bruit aléatoire)
// → change uniquement lors d'un changement de saison (~70 ticks), évite 4800 UPDATE/tick
function calcPrecipitation(biomeType, season) {
  const base = BIOME_BASE_PRECIP[biomeType] ?? 40;
  let mod = 1;
  if (season === 'été') mod = biomeType === 'desert_hot' ? 0.5 : 1.1;
  else if (season === 'hiver') mod = ['tundra', 'mountain'].includes(biomeType) ? 1.4 : 0.7;
  else if (season === 'printemps') mod = 1.3;
  else if (season === 'automne') mod = 0.9;
  return Math.round(Math.min(100, Math.max(0, base * mod)));
}

// Calcul jour/nuit selon la saison : été = longues journées, hiver = longues nuits
function isNightTime(tick, season) {
  const ticksPerDay = parseInt(process.env.TICKS_PER_DAY || '10');
  const posInDay = tick % ticksPerDay; // 0 = début du jour
  // Durée nuit : été 30%, hiver 70%, printemps/automne 50%
  const nightFraction = season === 'été' ? 0.3 : season === 'hiver' ? 0.7 : 0.5;
  const nightStart = Math.floor(ticksPerDay * (1 - nightFraction));
  return posInDay >= nightStart;
}

function updateWorld(world, biomes, creatures) {
  const ticksPerDay = parseInt(process.env.TICKS_PER_DAY || '10');
  const ticksPerSeason = ticksPerDay * 7;
  const ticksPerYear = ticksPerSeason * 4;

  const newTick = world.tick + 1;
  const newDay = Math.floor(newTick / ticksPerDay) + 1;
  const seasonIdx = Math.floor(newTick / ticksPerSeason) % 4;
  const newSeason = SEASONS[seasonIdx];
  const newYear = Math.floor(newTick / ticksPerYear) + 1;

  const isNight = isNightTime(newTick, newSeason);

  // Température globale par saison
  const globalTemp = newSeason === 'été' ? 28 : newSeason === 'hiver' ? 5 : 18;

  // Pré-indexer les créatures par position : O(créatures) au lieu de O(biomes × créatures)
  const creaturesByPos = {};
  for (const c of creatures) {
    if (c.status === 'alive') {
      const key = `${c.x},${c.y}`;
      if (!creaturesByPos[key]) creaturesByPos[key] = [];
      creaturesByPos[key].push(c);
    }
  }

  // Mise à jour des biomes (régénération végétation + eau + précipitations)
  const updatedBiomes = biomes.map(b => {
    const regenFood = (BIOME_REGEN[b.biome_type] ?? 1) * getSeasonModifier(newSeason, b.biome_type);
    const regenWater = BIOME_WATER_REGEN[b.biome_type] ?? 0.5;

    // Consommation de nourriture par les créatures qui mangent ici (lookup O(1))
    const creaturesHere = creaturesByPos[`${b.x},${b.y}`] || [];
    let foodConsumption = 0;
    for (const c of creaturesHere) {
      if (c.last_action === 'MANGER') {
        foodConsumption += 1;
      }
    }

    const newFood = Math.round(Math.min(100, Math.max(0, b.food_level + regenFood - foodConsumption)));
    const newWater = Math.round(Math.min(100, Math.max(0, b.water_level + regenWater)));
    const newPrecip = calcPrecipitation(b.biome_type, newSeason);

    // Marquer uniquement les biomes qui ont réellement changé pour éviter 4800 UPDATE/tick
    const _changed = newFood !== b.food_level || newWater !== b.water_level || newPrecip !== (b.precipitation ?? -1);

    return { ...b, food_level: newFood, water_level: newWater, precipitation: newPrecip, _changed };
  });

  // Catastrophes aléatoires (très rares)
  const catastrophes = world.catastrophes ? [...world.catastrophes] : [];
  const newEvents = [];

  if (Math.random() < 0.008) { // 0.8% chance par tick
    const CATASTROPHE_TYPES = ['sécheresse', 'incendie', 'tempête', 'inondation', 'éruption volcanique', 'foudre'];
    const type = CATASTROPHE_TYPES[Math.floor(Math.random() * CATASTROPHE_TYPES.length)];
    const x = Math.floor(Math.random() * 80);
    const y = Math.floor(Math.random() * 60);
    const radius = Math.floor(Math.random() * 5) + 3; // rayon 3–7

    newEvents.push({
      type: 'catastrophe',
      description: `Une ${type} frappe la zone (${x}, ${y}) !`,
      x, y,
    });

    // Appliquer l'effet sur les biomes proches
    updatedBiomes.forEach(b => {
      const dist = Math.abs(b.x - x) + Math.abs(b.y - y);
      if (dist < radius) {
        if (type === 'sécheresse') {
          b.water_level = Math.max(0, b.water_level - 40);
          b.food_level = Math.max(0, b.food_level - 20);
        }
        if (type === 'incendie' && ['tropical_forest', 'temperate_forest', 'savanna', 'prairie'].includes(b.biome_type)) {
          b.food_level = Math.max(0, b.food_level - 70);
          b.water_level = Math.max(0, b.water_level - 15);
        }
        if (type === 'tempête') {
          b.precipitation = Math.min(100, b.precipitation + 40);
          b.water_level = Math.min(100, b.water_level + 20);
        }
        if (type === 'inondation' && ['coast', 'swamp', 'prairie'].includes(b.biome_type)) {
          b.water_level = Math.min(100, b.water_level + 50);
          b.food_level = Math.max(0, b.food_level - 30);
        }
        if (type === 'éruption volcanique' && dist < radius / 2) {
          b.food_level = Math.max(0, b.food_level - 80);
          b.water_level = Math.max(0, b.water_level - 30);
          b.temperature = Math.min(50, (b.temperature || 20) + 15);
        }
        if (type === 'foudre' && dist < 2 && ['tropical_forest', 'temperate_forest', 'savanna'].includes(b.biome_type)) {
          // Déclenche un incendie localisé
          b.food_level = Math.max(0, b.food_level - 40);
        }
        b._changed = true;
      }
    });
  }

  const weatherState = {
    isNight,
    season: newSeason,
    globalTemp,
    // Précipitations moyennes globales pour l'overlay
    avgPrecip: Math.round(updatedBiomes.reduce((sum, b) => sum + (b.precipitation || 50), 0) / Math.max(1, updatedBiomes.length)),
  };

  return {
    world: { ...world, tick: newTick, day: newDay, season: newSeason, year: newYear, weather_state: weatherState, catastrophes },
    biomes: updatedBiomes,
    newEvents,
  };
}

module.exports = { updateWorld };
