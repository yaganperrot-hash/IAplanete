require('dotenv').config();
const { db } = require('../config/db');
const { migrate } = require('../../scripts/migrate');
const civLLM = require('../llm/civGeminiLLM');
const {
  resolveEffect, parseEffets, advanceProcesses, buildCivContext,
  initTerritory, discoverAdjacentCivs, updateResources, getMilitaryPower,
  normalizeBuildings, expandTerritory, CATEGORY_EFFECTS, TECH_AGES,
} = require('./civActionResolver');
const { calculateMoral, checkWorkerConsistency } = require('./moralSystem');
const { checkFrontierContact, resolveSpying, resolveTradeExpedition, buildNeighborInfo } = require('./civInteractions');

const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

// Seuils de progression technologique — prérequis par catégorie
const TECH_THRESHOLDS = {
  primitif:    { next: 'neolithique', pop: 50 },
  neolithique: { next: 'bronze',      pop: 150, category: 'agriculture' },
  bronze:      { next: 'fer',         pop: 300, category: 'militaire' },
  fer:         { next: 'classique',   pop: 600 },
  classique:   { next: 'medieval',    pop: 2000 },
  medieval:    { next: 'industriel',  pop: 5000 },
  industriel:  { next: 'moderne',     pop: 10000 },
  moderne:     { next: 'spatial',     pop: 20000 },
};

class CivEngine {
  constructor(io) {
    this.io = io;
    this.running  = false;
    this.worldId  = null;
    this.tickInterval = parseInt(process.env.CIV_TICK_INTERVAL_MS || '60000');
    this._timer   = null;
  }

  init() {
    migrate();
    civLLM.init();
    const { seed } = require('../../scripts/civSeed');
    let world = db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' LIMIT 1").get();
    if (!world) {
      console.log('Aucun monde Civilisations → création...');
      this.worldId = seed();
    } else {
      const biomeCount = db.prepare('SELECT COUNT(*) as n FROM biomes WHERE world_id=?').get(world.id).n;
      if (biomeCount === 0) {
        console.log('⚠️  Monde Civilisations sans biomes → réinitialisation...');
        db.prepare('DELETE FROM worlds WHERE id=?').run(world.id);
        this.worldId = seed();
      } else {
        this.worldId = world.id;
        console.log(`✓ Monde Civilisations chargé (id=${this.worldId}, ${biomeCount} biomes)`);
      }
    }
  }

  reload() {
    const world = db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' LIMIT 1").get();
    if (world) this.worldId = world.id;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`✓ Moteur Civilisations démarré (tick toutes les ${this.tickInterval / 1000}s)`);
    this._scheduleNextTick();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
  }

  _scheduleNextTick() {
    this._timer = setTimeout(async () => {
      try { await this._tick(); } catch (err) { console.error('Erreur tick civ:', err.message); }
    }, this.tickInterval);
  }

  async _tick() {
    if (!this.running || !this.worldId) return;
    const startTime = Date.now();

    const worldRow = db.prepare('SELECT * FROM worlds WHERE id=?').get(this.worldId);
    if (!worldRow) return;
    const currentTick = (worldRow.tick || 0) + 1;

    const biomes = db.prepare('SELECT * FROM biomes WHERE world_id=?').all(this.worldId);
    const biomesMap = {};
    for (const b of biomes) biomesMap[`${b.x},${b.y}`] = b;

    const allCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    const events  = [];

    // ═══ ÉTAPE 1 : RESSOURCES & DÉMOGRAPHIE ══════════════════════════════════
    console.log(`[TICK ${currentTick}] === Étape 1 : ressources ===`);
    for (const civ of allCivs) {
      const { newResources, consequences, births, isFamine } = updateResources(civ, biomesMap);
      const { naturalDeaths, famineDelta, production, consumption } = consequences;
      const pop    = civ.population || 0;
      const newPop = Math.max(0, pop + births - naturalDeaths + famineDelta);

      // ── Moral composite (VALUE_SATISFACTION) ──
      const civForMoral = { ...civ, population: newPop, resources: JSON.stringify(newResources) };
      const { moral: newMoral, frustrations, satisfactions, moralLabel } = calculateMoral(civForMoral, currentTick);

      // ── Révolte si moral < 20 ──
      let revoltLoss = 0;
      if (newMoral < 20 && newPop > 50) {
        const chance = (20 - newMoral) * 0.02;
        if (Math.random() < chance) {
          revoltLoss = Math.ceil(newPop * 0.03);
        }
      }

      // ── checkWorkerConsistency ──
      const processesRow = db.prepare("SELECT COALESCE(SUM(workers),0) as total FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'").get(civ.id, this.worldId);
      const procWorkers  = processesRow?.total || 0;
      const freeLabor    = checkWorkerConsistency({ ...civ, population: newPop }, procWorkers);

      // ── Puissance militaire ──
      const newMilitary = getMilitaryPower(civ.army_soldiers || 0, civ.age_tech);

      // ── Logs ──
      console.log(`  [TICK ${currentTick}] === CIV: ${civ.nom} ===`);
      for (const res of Object.keys(newResources)) {
        const prev  = parseJ(civ.resources, {})[res] || 0;
        const prod  = production[res] || 0;
        const cons  = consumption[res] || 0;
        const bilan = prod - cons;
        if (prev === 0 && newResources[res] === 0 && prod === 0) continue;
        const warn     = res === 'nourriture' && isFamine ? ' ⚠️' : '';
        const bilanStr = prod > 0 || cons > 0
          ? ` (prod:+${prod} conso:-${cons} bilan:${bilan >= 0 ? '+' : ''}${bilan})`
          : ` (+${newResources[res] - prev})`;
        console.log(`  [RESOURCES] ${res}: ${prev}→${newResources[res]}${bilanStr}${warn}`);
      }
      console.log(`  [DEMO] pop: ${pop}→${newPop} (naiss:+${births}, morts_nat:-${naturalDeaths}, famine:${famineDelta})`);
      console.log(`  [MORAL] ${newMoral}/100 (${moralLabel})`);
      if (satisfactions.length) console.log(`    ✅ ${satisfactions.join(' | ')}`);
      if (frustrations.length)  console.log(`    ⚠️  ${frustrations.join(' | ')}`);
      console.log(`  [WORKERS] pop:${newPop} | proc:${procWorkers} | armée:${civ.army_soldiers || 0} | libre:${freeLabor}`);

      db.prepare('UPDATE civilizations SET resources=?, army_soldiers=?, population=?, moral=?, military_power=? WHERE id=?')
        .run(JSON.stringify(newResources), civ.army_soldiers || 0, Math.max(0, newPop - revoltLoss), newMoral, newMilitary, civ.id);

      if (newPop <= 0) {
        db.prepare("UPDATE civilizations SET status='effondree', died_at=datetime('now') WHERE id=?").run(civ.id);
        events.push({ type: 'effondrement', description: `La civilisation ${civ.nom} vient de s'effondrer...`, civ_ids: [civ.id] });
      }
      if (isFamine) {
        events.push({ type: 'famine', description: `Famine dans ${civ.nom} ! Les réserves de nourriture sont épuisées.`, civ_ids: [civ.id] });
      }
      if (revoltLoss > 0) {
        const lostCells = db.prepare('SELECT id FROM territories WHERE civ_id=? AND world_id=? ORDER BY RANDOM() LIMIT 2').all(civ.id, this.worldId);
        for (const cell of lostCells) db.prepare('DELETE FROM territories WHERE id=?').run(cell.id);
        if (lostCells.length) db.prepare('UPDATE civilizations SET territory_count=MAX(0,territory_count-?) WHERE id=?').run(lostCells.length, civ.id);
        events.push({ type: 'revolte', description: `Révolte dans ${civ.nom} (moral ${newMoral}) ! -${revoltLoss} déserteurs.`, civ_ids: [civ.id] });
        console.log(`  [REVOLT] ${civ.nom}: moral=${newMoral} → -${revoltLoss} pop`);
      }

      // ── Auto-expansion si densité > 50 hab/case ──
      const terrCount = civ.territory_count || 1;
      const density   = newPop / terrCount;
      if (density > 50 && newPop > 0) {
        const dirs = ['nord', 'sud', 'est', 'ouest'];
        const dir  = dirs[Math.floor(Math.random() * dirs.length)];
        const added = expandTerritory(civ, dir, biomesMap, this.worldId, 1 + Math.floor(density / 50));
        if (added > 0) console.log(`  [EXPAND] ${civ.nom}: densité ${Math.round(density)} → +${added} cases auto`);
      }
    }

    // ═══ ÉTAPE 2 : PROCESSUS ACTIFS ══════════════════════════════════════════
    const aliveCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    for (const civ of aliveCivs) {
      const { completed, updates } = advanceProcesses(civ.id, this.worldId, civ.buildings, biomesMap, civ);

      if (Object.keys(updates).length > 0) {
        const { _military_bonus, _moral_bonus, _defense_bonus, ...dbUpdates } = updates;
        if (dbUpdates.buildings)
          db.prepare('UPDATE civilizations SET buildings=? WHERE id=?').run(dbUpdates.buildings, civ.id);
        if (_military_bonus)
          db.prepare('UPDATE civilizations SET military_power=MIN(1000,military_power+?) WHERE id=?').run(_military_bonus, civ.id);
        if (_moral_bonus)
          db.prepare('UPDATE civilizations SET moral=MIN(100,moral+?) WHERE id=?').run(_moral_bonus, civ.id);
      }

      for (const proc of completed) {
        if (proc.type === 'construction') {
          const autoW = proc.workers || 0;
          const msg = autoW > 0
            ? `${civ.nom} a terminé "${proc.target}" — ${autoW} constructeurs y sont affectés.`
            : `${civ.nom} a terminé la construction de "${proc.target}" !`;
          events.push({ type: 'construction', description: msg, civ_ids: [civ.id] });
          console.log(`  [PROC] construction terminée: ${proc.target} | auto-workers: ${autoW}`);
        } else if (proc.type === 'exploration') {
          const added = proc.territory_added || 0;
          const workers = proc.workers || 0;
          const workerMsg = workers > 0 ? ` ${workers} explorateurs sont revenus dans la main-d'œuvre.` : '';
          events.push({
            type: 'exploration',
            description: `Les éclaireurs de ${civ.nom} rentrent (${proc.target}) : +${added} territoires.${workerMsg}`,
            civ_ids: [civ.id],
          });
          console.log(`  [PROC] exploration terminée: ${proc.target} | +${added} terr. | ${workers} workers libérés`);
        } else if (proc.type === 'mission') {
          const workers = proc.workers || 0;
          if (workers > 0) {
            console.log(`  [PROC] mission terminée: ${proc.target} | ${workers} workers libérés`);
            events.push({ type: 'mission', description: `${civ.nom} : mission "${proc.target}" terminée — ${workers} personnes de retour.`, civ_ids: [civ.id] });
          }
        } else if (proc.resolve_type === 'espionnage') {
          const latestCiv = db.prepare('SELECT * FROM civilizations WHERE id=?').get(civ.id);
          const result = resolveSpying(latestCiv, proc.target_civ_id, aliveCivs, currentTick);
          events.push({ type: result.success ? 'espionnage' : 'echec', description: `${civ.nom} : ${result.message}`, civ_ids: [civ.id] });
          if (result.captured && proc.target_civ_id) {
            events.push({ type: 'espionnage', description: result.targetMessage || '', civ_ids: [proc.target_civ_id] });
          }
          console.log(`  [PROC] espionnage terminé: ${proc.target} → ${result.success ? 'succès' : 'échec'}`);
        } else if (proc.resolve_type === 'commerce_expedition') {
          const latestCiv = db.prepare('SELECT * FROM civilizations WHERE id=?').get(civ.id);
          const result = resolveTradeExpedition(latestCiv, proc.target_civ_id, aliveCivs, currentTick);
          events.push({ type: result.success ? 'commerce' : 'echec', description: `${civ.nom} : ${result.message}`, civ_ids: [civ.id] });
          console.log(`  [PROC] expédition commerciale terminée: ${proc.target} → ${result.success ? 'succès' : 'échec'}`);
        } else if (proc.resolve_type === 'emissaire') {
          const targetId = proc.target_civ_id;
          if (targetId) {
            const pairMin = Math.min(civ.id, targetId);
            const pairMax = Math.max(civ.id, targetId);
            db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
              .run(this.worldId, pairMin, pairMax, 'neutre');
            const targetName = aliveCivs.find(c => c.id === targetId)?.nom || 'inconnu';
            events.push({ type: 'diplomatie', description: `${civ.nom} établit un contact diplomatique avec ${targetName}.`, civ_ids: [civ.id, targetId] });
          }
          console.log(`  [PROC] émissaire terminé: ${proc.target}`);
        }
      }
    }

    // ═══ ÉTAPE 2b : BROUILLARD DE GUERRE — découverte par adjacence ══════════
    const aliveCivIds = aliveCivs.map(c => c.id);
    for (const civ of aliveCivs) {
      const newlyFound = discoverAdjacentCivs(civ.id, this.worldId, aliveCivIds);
      for (const foundId of newlyFound) {
        const foundCiv = aliveCivs.find(c => c.id === foundId);
        if (foundCiv) {
          // Mise à jour du knowledge_about avec l'observation initiale
          checkFrontierContact(civ, foundCiv, this.worldId, currentTick);
          events.push({
            type: 'decouverte',
            description: `${civ.nom} découvre une nouvelle civilisation : "${foundCiv.nom}" !`,
            civ_ids: [civ.id, foundId],
          });
          console.log(`  [FOG] ${civ.nom} découvre ${foundCiv.nom} !`);
        }
      }
    }

    // ═══ ÉTAPE 3 : PROGRESSION TECHNOLOGIQUE ════════════════════════════════
    const currentCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    for (const civ of currentCivs) {
      const threshold = TECH_THRESHOLDS[civ.age_tech];
      if (!threshold) continue;
      const popOk = (civ.population || 0) >= threshold.pop;
      const structs = normalizeBuildings(civ.buildings);
      const catOk = !threshold.category ||
        structs.some(b => b.category === threshold.category && (b.status === 'active' || b.status === 'task'));
      if (popOk && catOk) {
        db.prepare('UPDATE civilizations SET age_tech=? WHERE id=?').run(threshold.next, civ.id);
        events.push({ type: 'technologie', description: `${civ.nom} entre dans l'âge ${threshold.next} ! Un nouveau chapitre commence.`, civ_ids: [civ.id] });
      }
    }

    // ═══ ÉTAPE 4 : DÉCISIONS LLM (seulement si idle ou urgence) ═════════════
    const liveCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    const thoughtLogs = [];

    for (const civ of liveCivs) {
      // Vérifier si la civ a des processus actifs
      const activeCount = db.prepare(
        "SELECT COUNT(*) as n FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'"
      ).get(civ.id, this.worldId).n;

      const isIdle      = activeCount === 0;
      const isFamine    = (parseJ(civ.resources, {}).nourriture || 0) <= 0;
      const isUnderAttack = db.prepare(
        "SELECT COUNT(*) as n FROM diplomacy WHERE world_id=? AND (civ_a_id=? OR civ_b_id=?) AND relation='guerre'"
      ).get(this.worldId, civ.id, civ.id).n > 0;

      if (!isIdle && !isFamine && !isUnderAttack) {
        console.log(`  [CIV] ${civ.nom}: en cours (${activeCount} processus) → pas d'appel LLM`);
        continue; // économie de quota
      }

      const reason = isIdle ? 'idle' : isFamine ? 'FAMINE' : 'SOUS_ATTAQUE';
      console.log(`  [CIV] ${civ.nom}: appel LLM (${reason})`);

      // Enrichir le contexte avec moral composite et knowledge voisins
      const moralCtx  = calculateMoral(civ, currentTick);
      const context   = buildCivContext(civ, liveCivs, this.worldId, currentTick, biomesMap);
      context.frustrations   = moralCtx.frustrations;
      context.satisfactions  = moralCtx.satisfactions;
      context.moralLabel     = moralCtx.moralLabel;
      context.neighbors_info = buildNeighborInfo(civ, liveCivs);
      console.log(`  [QUESTION] ${(moralCtx.frustrations[0] || moralCtx.satisfactions[0] || 'Situation stable').slice(0, 80)}`);
      const { strategie, effets_text, actions, raison } = await civLLM.decide(context);
      thoughtLogs.push({ civId: civ.id, actions, raison: strategie });

      // Parser les effets
      const effects  = parseEffets(effets_text);
      let civState   = { ...civ };
      let allUpdates = {};

      for (const effect of effects) {
        // Propager les updates précédents dans civState avant chaque effet
        Object.assign(civState, allUpdates);
        const updates = resolveEffect(effect, civState, liveCivs, this.worldId, biomesMap, events, currentTick);
        Object.assign(allUpdates, updates);
      }

      if (Object.keys(allUpdates).length > 0) {
        const fields = Object.keys(allUpdates).filter(k => !k.startsWith('_')).map(k => `${k}=?`).join(', ');
        const values = Object.entries(allUpdates).filter(([k]) => !k.startsWith('_')).map(([, v]) => v);
        if (fields) db.prepare(`UPDATE civilizations SET ${fields} WHERE id=?`).run(...values, civ.id);
      }

      const refreshed = db.prepare('SELECT population, territory_count, moral FROM civilizations WHERE id=?').get(civ.id);
      console.log(`  [CIV] ${civ.nom}: "${(strategie || '').slice(0, 60)}..." | pop=${refreshed?.population} moral=${refreshed?.moral} terr=${refreshed?.territory_count}`);
    }

    // ═══ ÉTAPE 5 : PERSISTER ════════════════════════════════════════════════
    db.transaction(() => {
      db.prepare('UPDATE worlds SET tick=? WHERE id=?').run(currentTick, this.worldId);

      const stmtLog = db.prepare('INSERT INTO civ_thought_logs (civ_id, world_id, tick, actions, raison) VALUES (?,?,?,?,?)');
      for (const log of thoughtLogs)
        stmtLog.run(log.civId, this.worldId, currentTick, JSON.stringify(log.actions), log.raison);

      const stmtEv = db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)');
      for (const ev of events)
        stmtEv.run(this.worldId, currentTick, ev.type, ev.description, JSON.stringify(ev.civ_ids || []));
    })();

    // ═══ ÉTAPE 6 : BROADCAST ════════════════════════════════════════════════
    const TICKS_PER_YEAR = 12;
    const SEASONS = ['Printemps', 'Été', 'Automne', 'Hiver'];
    const year      = Math.floor(currentTick / TICKS_PER_YEAR) + 1;
    const season    = SEASONS[Math.floor((currentTick % TICKS_PER_YEAR) / 3)];
    const dayOfYear = (currentTick % TICKS_PER_YEAR) + 1;
    this._broadcast(currentTick, events, { year, season, dayOfYear });

    const elapsed = Date.now() - startTime;
    console.log(`[CIV] Tick ${currentTick} (An ${year}, ${season}) en ${elapsed}ms | ${liveCivs.length} civilisations`);

    if (this.running) this._scheduleNextTick();
  }

  _broadcast(currentTick, newEvents, calendar = {}) {
    const civs       = db.prepare('SELECT * FROM civilizations WHERE world_id=?').all(this.worldId);
    const territories = db.prepare('SELECT civ_id, x, y FROM territories WHERE world_id=?').all(this.worldId);
    const recentEvents = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT 30').all(this.worldId)
      .map(e => ({ ...e, civ_ids: parseJ(e.species_ids, []) }));
    const thoughtLogs = db.prepare('SELECT * FROM civ_thought_logs WHERE world_id=? ORDER BY id DESC LIMIT 20').all(this.worldId)
      .map(t => ({ ...t, actions: parseJ(t.actions, []) }));

    this.io.emit('civ:tick:update', {
      tick: currentTick,
      year: calendar.year || 1,
      season: calendar.season || 'Printemps',
      dayOfYear: calendar.dayOfYear || 1,
      civs: civs.map(c => ({
        id: c.id, nom: c.nom, color: c.color, creator_name: c.creator_name,
        age_tech: c.age_tech, population: c.population, moral: c.moral,
        food: c.food, materials: c.materials, military_power: c.military_power,
        resources: parseJ(c.resources, {}),
        army_soldiers: c.army_soldiers || 0,
        territory_count: c.territory_count, status: c.status,
        gouvernement: c.gouvernement, valeurs: parseJ(c.valeurs, []),
        capital_x: c.capital_x, capital_y: c.capital_y,
        buildings: normalizeBuildings(c.buildings),
      })),
      territories,
      new_events: newEvents,
      recent_events: recentEvents,
      thought_logs: thoughtLogs,
    });
  }
}

module.exports = { CivEngine };
