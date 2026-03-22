require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('../src/config/db');
const { migrate } = require('./migrate');
const { generateMap } = require('../src/simulation/mapGenerator');
const { initTerritory } = require('../src/simulation/civActionResolver');

const DEMO_CIVS = [
  {
    nom: "L'Empire du Feu",
    creator_name: 'Demo',
    valeurs: ['guerre', 'expansion', 'ordre'],
    gouvernement: 'monarchie',
    description: 'Un empire conquérant, assoiffé de territoire et de gloire. La force prime sur la diplomatie.',
    color: '#ef4444',
    capital_x: 60, capital_y: 80,
  },
  {
    nom: 'Les Marchands d\'Or',
    creator_name: 'Demo',
    valeurs: ['commerce', 'savoir', 'liberte'],
    gouvernement: 'democratie',
    description: 'Une nation commerçante qui préfère la prospérité économique à la guerre. Le savoir est leur richesse.',
    color: '#f59e0b',
    capital_x: 180, capital_y: 60,
  },
  {
    nom: 'Le Clan Libre',
    creator_name: 'Demo',
    valeurs: ['survie', 'exploration', 'liberte'],
    gouvernement: 'anarchie_cooperative',
    description: 'Un peuple nomade et résilient qui s\'adapte à tout. Ils explorent sans relâche et survivent là où d\'autres périssent.',
    color: '#22c55e',
    capital_x: 120, capital_y: 150,
  },
];

function seed() {
  migrate();

  // Créer le monde civilisations
  const worldId = db.prepare(
    "INSERT INTO worlds (nom, world_type, weather_state, catastrophes) VALUES (?,?,?,?)"
  ).run('WorldIA Civilisations', 'civilisations', '{}', '[]').lastInsertRowid;

  console.log(`✓ Monde Civilisations créé (id=${worldId})`);

  // Générer la carte (partage la même logique que AI Planet)
  // generateMap retourne { cells, width, height }
  const { cells } = generateMap(worldId);
  const insertBiome = db.prepare('INSERT OR IGNORE INTO biomes (world_id, x, y, biome_type, food_level, water_level, precipitation, deposits) VALUES (?,?,?,?,?,?,?,?)');
  const insertAllBiomes = db.transaction(() => {
    for (const b of cells) insertBiome.run(worldId, b.x, b.y, b.biome_type, b.food_level, b.water_level, b.precipitation ?? 50, JSON.stringify(b.deposits || []));
  });
  insertAllBiomes();
  console.log(`✓ Carte générée (${cells.length} biomes)`);

  // Construire biomesMap pour initTerritory
  const biomesMap = {};
  for (const b of cells) biomesMap[`${b.x},${b.y}`] = b;

  // Ressources initiales pour chaque nouvelle civilisation
  const INITIAL_RESOURCES = { nourriture: 200, bois: 100, pierre: 50, glaise: 30, silex: 40, sable: 0, sel: 0, cuivre: 0, etain: 0, fer: 0, or: 0, charbon: 0 };

  // Créer les civilisations de démo
  const colors = DEMO_CIVS.map(c => c.color);
  for (const civData of DEMO_CIVS) {
    const civId = db.prepare(
      'INSERT INTO civilizations (world_id, nom, creator_name, valeurs, gouvernement, description, color, capital_x, capital_y, resources) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      worldId, civData.nom, civData.creator_name,
      JSON.stringify(civData.valeurs), civData.gouvernement,
      civData.description, civData.color,
      civData.capital_x, civData.capital_y,
      JSON.stringify(INITIAL_RESOURCES)
    ).lastInsertRowid;

    // Initialiser le territoire de départ
    const civRow = { id: civId, capital_x: civData.capital_x, capital_y: civData.capital_y };
    const territoryCount = initTerritory(civRow, biomesMap, worldId);
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(territoryCount, civId);

    // Insérer l'événement de naissance
    db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)')
      .run(worldId, 0, 'naissance', `La civilisation "${civData.nom}" vient d'entrer dans le monde !`, JSON.stringify([civId]));

    console.log(`✓ Civ "${civData.nom}" créée (id=${civId}, territoire=${territoryCount} cases)`);
  }

  return worldId;
}

if (require.main === module) {
  seed();
  console.log('\n✓ Seed WorldIA Civilisations terminé');
}

module.exports = { seed };
