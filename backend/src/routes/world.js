const express = require('express');
const { db } = require('../config/db');

const parseJ = (v, fb = {}) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

// engine est injecté depuis server.js pour permettre reload() après reset
module.exports = function createWorldRouter(engine) {
const router = express.Router();

router.get('/', (req, res) => {
  const world = db.prepare('SELECT * FROM worlds LIMIT 1').get();
  if (!world) return res.status(404).json({ error: 'Aucun monde trouvé' });

  const alive_creatures = db.prepare("SELECT COUNT(*) as n FROM creatures WHERE world_id=? AND status='alive'").get(world.id).n;
  const alive_species = db.prepare("SELECT COUNT(*) as n FROM species WHERE world_id=? AND status='alive'").get(world.id).n;
  const extinct_species = db.prepare("SELECT COUNT(*) as n FROM species WHERE world_id=? AND status='extinct'").get(world.id).n;

  res.json({
    world: { ...world, weather_state: parseJ(world.weather_state), catastrophes: parseJ(world.catastrophes, []) },
    stats: { alive_creatures, alive_species, extinct_species },
  });
});

router.get('/biomes', (req, res) => {
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.status(404).json({ error: 'Monde introuvable' });
  const biomes = db.prepare('SELECT x, y, biome_type, food_level, water_level FROM biomes WHERE world_id=? ORDER BY y, x').all(world.id);
  res.json({ biomes });
});

router.get('/creatures', (req, res) => {
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.status(404).json({ error: 'Monde introuvable' });
  const creatures = db.prepare("SELECT id, species_id, x, y, energy, health, age FROM creatures WHERE world_id=? AND status='alive'").all(world.id);
  res.json({ creatures });
});

router.get('/leaderboard', (req, res) => {
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.json({ leaderboard: [] });
  const rows = db.prepare(
    `SELECT id, nom, color, status, population, total_kills, ticks_alive, params, stats
     FROM species WHERE world_id=? ORDER BY population DESC`
  ).all(world.id).map(r => ({
    ...r,
    params: parseJ(r.params),
    stats: parseJ(r.stats),
  }));
  res.json({ leaderboard: rows });
});

router.post('/reset', (req, res) => {
  try {
    const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
    if (world) db.prepare('DELETE FROM worlds WHERE id=?').run(world.id);
    const { seed } = require('../../scripts/seed');
    const worldId = seed();
    // Mettre à jour l'engine avec le nouveau worldId
    if (engine) engine.reload();
    res.json({ message: 'Monde réinitialisé', worldId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

return router;
};
