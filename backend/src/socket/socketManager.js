const { db } = require('../config/db');

const parseJ = (v, fb = {}) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

function initSocketManager(io) {
  io.on('connection', (socket) => {
    console.log(`Client connecté : ${socket.id}`);

    try {
      const worldRow = db.prepare('SELECT * FROM worlds LIMIT 1').get();
      if (!worldRow) { socket.emit('world:init', { error: 'Monde non initialisé' }); return; }

      const world = { ...worldRow, weather_state: parseJ(worldRow.weather_state), catastrophes: parseJ(worldRow.catastrophes, []) };

      const biomes = db.prepare('SELECT x, y, biome_type, food_level, water_level, precipitation FROM biomes WHERE world_id=? ORDER BY y, x').all(world.id);
      const creatures = db.prepare("SELECT id, species_id, x, y, energy, health, age FROM creatures WHERE world_id=? AND status='alive'").all(world.id);
      const cadavres = db.prepare("SELECT id, species_id, x, y, died_at_tick FROM creatures WHERE world_id=? AND status='cadavre'").all(world.id);
      const speciesRows = db.prepare('SELECT * FROM species WHERE world_id=? ORDER BY created_at').all(world.id)
        .map(s => ({ ...s, params: parseJ(s.params), stats: parseJ(s.stats) }));
      const events = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT 50').all(world.id)
        .map(e => ({ ...e, species_ids: parseJ(e.species_ids, []) }));

      const alive_creatures = db.prepare("SELECT COUNT(*) as n FROM creatures WHERE world_id=? AND status='alive'").get(world.id).n;
      const alive_species = db.prepare("SELECT COUNT(*) as n FROM species WHERE world_id=? AND status='alive'").get(world.id).n;
      const extinct_species = db.prepare("SELECT COUNT(*) as n FROM species WHERE world_id=? AND status='extinct'").get(world.id).n;

      // Historique population (20 derniers ticks)
      const popHistory = db.prepare(
        'SELECT species_id, tick, population FROM population_history WHERE world_id=? AND tick > ? ORDER BY tick ASC'
      ).all(world.id, (world.tick || 0) - 20);

      const speciesStats = db.prepare(
        "SELECT id, total_kills, ticks_alive, population FROM species WHERE world_id=?"
      ).all(world.id);

      socket.emit('world:init', {
        world,
        stats: { alive_creatures, alive_species, extinct_species },
        biomes,
        creatures,
        cadavres,
        species: speciesRows,
        events,
        pop_history: popHistory,
        species_stats: speciesStats,
      });
    } catch (err) {
      console.error('Erreur init socket:', err.message);
      socket.emit('world:init', { error: err.message });
    }

    socket.on('request:species', () => {
      try {
        const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
        if (!world) return;
        const species = db.prepare('SELECT * FROM species WHERE world_id=? ORDER BY created_at').all(world.id)
          .map(s => ({ ...s, params: parseJ(s.params), stats: parseJ(s.stats) }));
        socket.emit('species:update', { species });
      } catch (err) {
        console.error('request:species error:', err.message);
      }
    });

    // Init monde Civilisations
    socket.on('request:civ:init', () => {
      try {
        const civWorld = db.prepare("SELECT * FROM worlds WHERE world_type='civilisations' LIMIT 1").get();
        if (!civWorld) { socket.emit('civ:world:init', { error: 'Monde Civilisations non initialisé' }); return; }

        const biomes = db.prepare('SELECT x, y, biome_type, food_level, water_level, precipitation FROM biomes WHERE world_id=? ORDER BY y, x').all(civWorld.id);
        const civs = db.prepare('SELECT * FROM civilizations WHERE world_id=?').all(civWorld.id)
          .map(c => ({ ...c, valeurs: parseJ(c.valeurs, []), buildings: parseJ(c.buildings, []) }));
        const territories = db.prepare('SELECT civ_id, x, y FROM territories WHERE world_id=?').all(civWorld.id);
        const events = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT 50').all(civWorld.id)
          .map(e => ({ ...e, civ_ids: parseJ(e.species_ids, []) }));
        const thoughts = db.prepare('SELECT * FROM civ_thought_logs WHERE world_id=? ORDER BY id DESC LIMIT 30').all(civWorld.id)
          .map(t => ({ ...t, actions: parseJ(t.actions, []) }));

        socket.emit('civ:world:init', {
          world: { tick: civWorld.tick, nom: civWorld.nom },
          biomes,
          civs,
          territories,
          events,
          thought_logs: thoughts,
        });
      } catch (err) {
        console.error('Erreur init civ socket:', err.message);
        socket.emit('civ:world:init', { error: err.message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client déconnecté : ${socket.id}`);
    });
  });
}

module.exports = { initSocketManager };
