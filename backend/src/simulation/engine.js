require('dotenv').config();
const { db } = require('../config/db');
const { migrate } = require('../../scripts/migrate');
const { updateWorld } = require('./worldUpdater');
const { buildContext, resolveActions } = require('./actionResolver');
const llm = require('../llm/mistralLLM');
const { checkSpeciation } = require('./speciationEngine');

const CADAVRE_TTL = 3; // Ticks avant suppression d'un cadavre

// Helpers JSON
const parseJ = (v, fallback = {}) => { try { return JSON.parse(v || JSON.stringify(fallback)); } catch { return fallback; } };

// Règles de survie non-négociables — override le LLM si la décision met l'espèce en danger
function survivalOverride(action, ctx) {
  const { energy, health, nearbyFood, nearbyPrey, nearbyThreats, nearbyMates,
          canReproduce, regime, adjacentReadyMates, nearbyPetits, reproStatus } = ctx;

  // 1. Fuite si prédateur ET santé critique
  if (nearbyThreats > 0 && health < 25) return 'FUIR';

  // 2. Manger/chasser si énergie critique (< 40)
  if (energy < 40) {
    if (nearbyFood > 0 && regime !== 'carnivore') return 'MANGER';
    if (nearbyPrey > 0 && ['carnivore', 'omnivore', 'insectivore'].includes(regime)) return 'CHASSER';
    return 'EXPLORER';
  }

  // 3. Protéger les petits si menace + petits proches
  if (nearbyPetits > 0 && nearbyThreats > 0
      && !['FUIR', 'MANGER', 'CHASSER'].includes(action)) {
    return 'PROTEGER_PETITS';
  }

  // 4. SE_REPRODUIRE si partenaire adjacent et pulsion haute
  if (canReproduce && adjacentReadyMates > 0 && energy > 60 && health > 55
      && !['FUIR', 'MANGER', 'CHASSER', 'BOIRE', 'DORMIR', 'PROTEGER_PETITS'].includes(action)) {
    if (Math.random() < 0.80) return 'SE_REPRODUIRE';
  }

  // 5. CHERCHER_PARTENAIRE si prêt mais partenaire pas encore adjacent
  if (canReproduce && nearbyMates > 0 && energy > 55 && health > 50
      && !['FUIR', 'MANGER', 'CHASSER', 'BOIRE', 'DORMIR', 'SE_REPRODUIRE', 'PROTEGER_PETITS'].includes(action)) {
    if (Math.random() < 0.65) return 'CHERCHER_PARTENAIRE';
  }

  return action;
}

class SimulationEngine {
  constructor(io) {
    this.io = io;
    this.running = false;
    this.worldId = null;
    this.tickInterval = parseInt(process.env.TICK_INTERVAL_MS || '15000');
    this._timer = null;
  }

  init() {
    migrate();
    llm.init();

    const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
    if (!world) {
      console.log('Aucun monde → seed automatique...');
      const { seed } = require('../../scripts/seed');
      this.worldId = seed();
    } else {
      this.worldId = world.id;
      console.log(`✓ Monde chargé (id=${this.worldId})`);
    }
  }

  // Appelé après un reset : recharge le worldId depuis la DB
  reload() {
    const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
    if (world) {
      this.worldId = world.id;
      console.log(`✓ Engine rechargé sur monde id=${this.worldId}`);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`✓ Moteur démarré (tick toutes les ${this.tickInterval / 1000}s)`);
    this._scheduleNextTick();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
  }

  _scheduleNextTick() {
    this._timer = setTimeout(async () => {
      try { await this._tick(); } catch (err) { console.error('Erreur tick:', err.message); }
    }, this.tickInterval);
  }

  async _tick() {
    if (!this.running || !this.worldId) return;
    const startTime = Date.now();

    // ---- ÉTAPE 1 : Charger l'état ----
    const worldRow = db.prepare('SELECT * FROM worlds WHERE id = ?').get(this.worldId);
    if (!worldRow) return;

    const world = { ...worldRow, weather_state: parseJ(worldRow.weather_state), catastrophes: parseJ(worldRow.catastrophes, []) };
    const currentTick = world.tick + 1;

    const biomes = db.prepare('SELECT * FROM biomes WHERE world_id = ?').all(this.worldId);

    // Créatures vivantes + cadavres récents (pour affichage et interactions)
    const creatures = db.prepare(
      "SELECT * FROM creatures WHERE world_id = ? AND (status = 'alive' OR (status = 'cadavre' AND died_at_tick >= ?))"
    ).all(this.worldId, currentTick - CADAVRE_TTL);

    const speciesList = db.prepare("SELECT * FROM species WHERE world_id = ?").all(this.worldId)
      .map(s => ({ ...s, params: parseJ(s.params), stats: parseJ(s.stats) }));
    const aliveSpeciesList = speciesList.filter(s => s.status === 'alive');

    const speciesMap = {};
    for (const sp of speciesList) speciesMap[sp.id] = sp;

    const biomesMap = {};
    for (const b of biomes) biomesMap[`${b.x},${b.y}`] = b;

    const aliveCreatures = creatures.filter(c => c.status === 'alive');

    // ---- ÉTAPE 2 : Mise à jour monde ----
    const { world: updatedWorld, biomes: updatedBiomes, newEvents: worldEvents } = updateWorld(world, biomes, aliveCreatures);

    // ---- ÉTAPE 3 : Décisions LLM ----
    const actionsBySpecies = {};
    const thoughtLogs = [];

    await Promise.all(aliveSpeciesList.map(async (sp) => {
      const spCreatures = aliveCreatures.filter(c => c.species_id === sp.id);
      if (!spCreatures.length) return;
      const context = buildContext(spCreatures, creatures, speciesMap, biomesMap, updatedWorld, currentTick);
      if (!context) return;
      context.speciesName = sp.nom;
      context.description = sp.params?.description || '';
      let { action, raison } = await llm.decide(context);

      // Règles de survie non-négociables (override LLM si décision inadaptée)
      const overridden = survivalOverride(action, context);
      if (overridden !== action) raison = '(instinct de survie)';
      action = overridden;

      actionsBySpecies[sp.id] = { action, context };
      thoughtLogs.push({ speciesId: sp.id, action, raison });
      console.log(`  [LLM] ${sp.nom}: ${action} | E=${context.energy} H=${context.health} prey=${context.nearbyPrey} mates=${context.nearbyMates} canRepro=${context.canReproduce}`);
    }));

    // ---- ÉTAPE 4 : Résolution actions ----
    const { creatures: resolvedCreatures, newCreatures, newEvents: actionEvents, killsBySpecies } = resolveActions(
      actionsBySpecies, creatures, speciesMap, biomesMap, updatedWorld, currentTick
    );

    // ---- ÉTAPE 5 : Persister en base (transaction atomique) ----
    const allEvents = [...worldEvents, ...actionEvents];
    this._persistTick(updatedWorld, updatedBiomes, resolvedCreatures, newCreatures, allEvents, thoughtLogs, speciesList, killsBySpecies, currentTick);

    // ---- ÉTAPE 6 : Nettoyer les vieux cadavres ----
    db.prepare("UPDATE creatures SET status='dead' WHERE world_id=? AND status='cadavre' AND died_at_tick < ?")
      .run(this.worldId, currentTick - CADAVRE_TTL);

    // ---- ÉTAPE 7 : Extinctions ----
    const extinctionEvents = this._checkExtinctions(aliveSpeciesList, resolvedCreatures);

    // ---- ÉTAPE 7b : Spéciation (toutes les 50 ticks) ----
    if (currentTick % 50 === 0) {
      const speciationEvents = checkSpeciation(this.worldId, currentTick);
      allEvents.push(...speciationEvents);
    }
    allEvents.push(...extinctionEvents);

    // ---- ÉTAPE 8 : Broadcast WebSocket ----
    this._broadcast(updatedWorld, resolvedCreatures, newCreatures, allEvents);

    const elapsed = Date.now() - startTime;
    const alive = resolvedCreatures.filter(c => c.status === 'alive').length + newCreatures.length;
    const biomesUpdated = updatedBiomes.filter(b => b._changed).length;
    console.log(`Tick ${updatedWorld.tick} en ${elapsed}ms | ${alive} créatures | ${biomesUpdated} biomes màj`);

    if (this.running) this._scheduleNextTick();
  }

  _persistTick(world, biomes, creatures, newCreatures, events, thoughtLogs, speciesList, killsBySpecies, currentTick) {
    const stmtUpdateWorld = db.prepare(
      'UPDATE worlds SET tick=?, day=?, season=?, year=?, weather_state=? WHERE id=?'
    );
    const stmtUpdateCreature = db.prepare(
      'UPDATE creatures SET x=?, y=?, energy=?, health=?, age=?, status=?, died_at=?, died_at_tick=?, last_reproduced_at=?, last_action=?, repro_drive=?, gestation_ticks=? WHERE id=?'
    );
    const stmtInsertCreature = db.prepare(
      'INSERT INTO creatures (species_id, world_id, x, y, energy, health, age, status, parent_id, last_reproduced_at, repro_drive, gestation_ticks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    const stmtInsertEvent = db.prepare(
      'INSERT INTO events (world_id, tick, type, description, species_ids, x, y) VALUES (?,?,?,?,?,?,?)'
    );
    const stmtInsertThought = db.prepare(
      'INSERT INTO thought_logs (species_id, world_id, tick, action, raison) VALUES (?,?,?,?,?)'
    );
    const stmtUpdateBiome = db.prepare(
      'UPDATE biomes SET food_level=?, water_level=?, precipitation=? WHERE id=?'
    );
    const stmtUpdatePop = db.prepare('UPDATE species SET population=?, ticks_alive=ticks_alive+1 WHERE id=?');
    const stmtUpdateKills = db.prepare('UPDATE species SET total_kills=total_kills+? WHERE id=?');
    const stmtInsertPopHistory = db.prepare(
      'INSERT INTO population_history (world_id, tick, species_id, population, kills_this_tick) VALUES (?,?,?,?,?)'
    );

    const persist = db.transaction(() => {
      stmtUpdateWorld.run(world.tick, world.day, world.season, world.year, JSON.stringify(world.weather_state), world.id);

      for (const c of creatures) {
        stmtUpdateCreature.run(
          c.x, c.y, c.energy, c.health, c.age, c.status,
          c.died_at || null, c.died_at_tick ?? null,
          c.last_reproduced_at || 0, c.last_action || null,
          c.repro_drive || 0, c.gestation_ticks || 0,
          c.id
        );
      }
      for (const c of newCreatures) {
        stmtInsertCreature.run(
          c.species_id, c.world_id, c.x, c.y, c.energy, c.health, c.age,
          c.status, c.parent_id || null, c.last_reproduced_at || 0, 0, 0
        );
      }
      for (const ev of events) {
        stmtInsertEvent.run(world.id, world.tick, ev.type, ev.description, JSON.stringify(ev.species_ids || []), ev.x ?? null, ev.y ?? null);
      }
      for (const log of thoughtLogs) {
        stmtInsertThought.run(log.speciesId, world.id, world.tick, log.action, log.raison);
      }
      for (const b of biomes) {
        if (b._changed) stmtUpdateBiome.run(b.food_level, b.water_level, b.precipitation ?? 50, b.id);
      }

      // Populations + historique
      for (const sp of speciesList) {
        if (sp.status !== 'alive') continue;
        const alive = creatures.filter(c => c.species_id === sp.id && c.status === 'alive').length
          + newCreatures.filter(c => c.species_id === sp.id).length;
        stmtUpdatePop.run(alive, sp.id);

        const killsNow = killsBySpecies[sp.id] || 0;
        if (killsNow > 0) stmtUpdateKills.run(killsNow, sp.id);

        // Enregistrer historique population
        stmtInsertPopHistory.run(world.id, world.tick, sp.id, alive, killsNow);
      }
    });

    persist();
  }

  _checkExtinctions(speciesList, creatures) {
    const events = [];
    for (const sp of speciesList) {
      const alive = creatures.filter(c => c.species_id === sp.id && c.status === 'alive').length;
      if (alive === 0) {
        db.prepare("UPDATE species SET status='extinct', extinct_at=datetime('now') WHERE id=?").run(sp.id);
        events.push({ type: 'extinction', description: `L'espèce ${sp.nom} vient de s'éteindre...`, species_ids: [sp.id] });
        console.log(`💀 Extinction : ${sp.nom}`);
      }
    }
    return events;
  }

  _broadcast(world, creatures, newCreatures, events) {
    const allAlive = [...creatures.filter(c => c.status === 'alive'), ...newCreatures];
    const cadavres = creatures.filter(c => c.status === 'cadavre');
    const recentEvents = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT 20').all(this.worldId)
      .map(e => ({ ...e, species_ids: parseJ(e.species_ids, []) }));

    // Lire les populations historiques des 20 derniers ticks pour sparklines
    const popHistory = db.prepare(
      'SELECT species_id, tick, population FROM population_history WHERE world_id=? AND tick > ? ORDER BY tick ASC'
    ).all(this.worldId, world.tick - 20);

    // Lire les stats espèces (kills, ticks_alive)
    const speciesStats = db.prepare(
      "SELECT id, total_kills, ticks_alive, population FROM species WHERE world_id=?"
    ).all(this.worldId);

    this.io.emit('tick:update', {
      world: {
        tick: world.tick, day: world.day, season: world.season, year: world.year,
        weather_state: world.weather_state,
      },
      creatures: allAlive.map(c => ({
        id: c.id, species_id: c.species_id, x: c.x, y: c.y,
        energy: c.energy, health: c.health, status: c.status,
      })),
      cadavres: cadavres.map(c => ({
        id: c.id, species_id: c.species_id, x: c.x, y: c.y,
        died_at_tick: c.died_at_tick,
      })),
      new_events: events,
      recent_events: recentEvents,
      pop_history: popHistory,
      species_stats: speciesStats,
    });
  }
}

module.exports = { SimulationEngine };
