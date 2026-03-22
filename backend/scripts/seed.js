require('dotenv').config();
const { db } = require('../src/config/db');
const { migrate } = require('./migrate');
const { generateMap } = require('../src/simulation/mapGenerator');

function seed() {
  migrate();

  // Supprimer l'ancien monde
  const existing = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (existing) {
    db.prepare('DELETE FROM worlds WHERE id = ?').run(existing.id);
    console.log('Ancien monde supprimé');
  }

  console.log('🗺️  Génération de la carte...');
  const { cells } = generateMap();

  const worldId = db.prepare(
    'INSERT INTO worlds (nom, tick, day, season, year, weather_state, catastrophes) VALUES (?,?,?,?,?,?,?)'
  ).run('AI Planet', 0, 1, 'printemps', 1, JSON.stringify({ isNight: false, season: 'printemps', globalTemp: 18 }), '[]').lastInsertRowid;

  console.log(`✓ Monde créé (id=${worldId})`);

  console.log(`🌍 Insertion de ${cells.length} biomes...`);
  const insertBiome = db.prepare(
    'INSERT INTO biomes (world_id, x, y, biome_type, food_level, water_level, temperature) VALUES (?,?,?,?,?,?,?)'
  );
  const insertAllBiomes = db.transaction((cells) => {
    for (const c of cells) {
      insertBiome.run(worldId, c.x, c.y, c.biome_type, c.food_level, c.water_level, c.temperature);
    }
  });
  insertAllBiomes(cells);

  console.log('\n✅ Monde prêt — crée tes espèces via l\'interface !\n');
  return worldId;
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
