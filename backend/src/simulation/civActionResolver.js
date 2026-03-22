// Résolution des effets libres des civilisations (Option B)

const { MAP_WIDTH, MAP_HEIGHT } = require('./mapGenerator');
const { db } = require('../config/db');

const OCEAN_BIOMES = ['ocean_deep', 'ocean', 'reef'];
const FOOD_BIOMES  = ['prairie', 'tropical_forest', 'temperate_forest', 'savanna', 'coast', 'swamp'];
const TECH_AGES    = ['primitif', 'neolithique', 'bronze', 'fer', 'classique', 'medieval', 'industriel', 'moderne', 'spatial'];

const parseJ = (v, fb) => { try { return JSON.parse(v != null ? v : JSON.stringify(fb)); } catch { return fb; } };

// ─── 12 ressources ───────────────────────────────────────────────────────────
const RESOURCES = ['nourriture', 'bois', 'pierre', 'glaise', 'silex', 'sable', 'sel', 'cuivre', 'etain', 'fer', 'or', 'charbon'];
const ZERO_RESOURCES = Object.fromEntries(RESOURCES.map(r => [r, 0]));

// ─── Taux de production par catégorie de structure ───────────────────────────
const PRODUCTION_RATES = {
  agriculture:  { resource: 'nourriture', rate: 2.0 },
  chasse:       { resource: 'nourriture', rate: 1.0 },
  peche:        { resource: 'nourriture', rate: 1.2 },
  maritime:     { resource: 'nourriture', rate: 1.5 },
  bois:         { resource: 'bois',       rate: 1.5 },
  extraction:   { resource: 'pierre',     rate: 1.0 },
  mine_cuivre:  { resource: 'cuivre',     rate: 0.3 },
  mine_fer:     { resource: 'fer',        rate: 0.2 },
  mine_or:      { resource: 'or',         rate: 0.1 },
  mine_charbon: { resource: 'charbon',    rate: 0.3 },
  production:   { resource: 'fer',        rate: 0.5 },
  commerce:     { resource: 'or',         rate: 0.2 },
  autre:        { resource: 'nourriture', rate: 0.3 },
  // intangibles : militaire, religieux, defense, savoir, surveillance → null
};

// ─── Bonus biome multiplicateur par ressource ────────────────────────────────
const BIOME_BONUS = {
  tropical_forest:  { nourriture: 1.5, bois: 1.5 },
  temperate_forest: { nourriture: 1.2, bois: 1.8 },
  prairie:          { nourriture: 1.5, silex: 1.2 },
  savanna:          { nourriture: 1.2 },
  hills:            { pierre: 1.5, cuivre: 1.3, etain: 1.3, charbon: 1.2 },
  mountain:         { pierre: 2.0, cuivre: 1.5, fer: 1.8, or: 1.5, charbon: 1.3 },
  swamp:            { nourriture: 0.8, glaise: 1.5 },
  coast:            { nourriture: 1.3 },
  reef:             { nourriture: 1.5 },
  desert_hot:       { nourriture: 0.5, sable: 1.5, sel: 1.3 },
  desert_cold:      { nourriture: 0.5 },
  tundra:           { nourriture: 0.6 },
  volcano:          { pierre: 1.2 },
};

// ─── Capacité de charge par biome (personnes max par case, cueillette seule) ──
const BIOME_CARRYING_CAPACITY = {
  tropical_forest:  15,
  temperate_forest: 12,
  prairie:          10,
  coast:             8,
  reef:              8,
  savanna:           6,
  river:            10,
  hills:             5,
  swamp:             4,
  mountain:          3,
  cave:              3,
  tundra:            2,
  volcano:           1,
  desert_hot:        1,
  desert_cold:       1,
  ocean_deep:        0,
  ocean:             0,
};

/**
 * Calcule la capacité de charge totale du territoire d'une civ.
 * Avec agriculture → ×3, avec irrigation → ×5.
 */
function getTerritoryCapacity(civ, biomesMap) {
  const buildings    = normalizeBuildings(civ.buildings);
  const hasAgriculture = buildings.some(b => b.category === 'agriculture' && (b.workers || 0) > 0);
  const hasIrrigation  = buildings.some(b => /irrigation|canal/i.test(b.name) && (b.workers || 0) > 0);
  const multiplier     = hasIrrigation ? 5 : hasAgriculture ? 3 : 1;

  const terrCells = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=?')
    .all(civ.id, civ.world_id || 1);

  let capacity = 0;
  for (const cell of terrCells) {
    const biome = biomesMap ? biomesMap[`${cell.x},${cell.y}`] : null;
    const base  = biome ? (BIOME_CARRYING_CAPACITY[biome.biome_type] ?? 3) : 3;
    capacity += base * multiplier;
  }
  return capacity;
}

// ─── Coûts de construction multi-ressources ───────────────────────────────────
const CREATION_COSTS = {
  agriculture:  { bois: 10 },
  militaire:    { bois: 15, pierre: 10 },
  defense:      { bois: 25, pierre: 20 },
  maritime:     { bois: 40 },
  bois:         { pierre: 5 },
  extraction:   { bois: 15, pierre: 10 },
  mine_cuivre:  { bois: 20, pierre: 15 },
  mine_fer:     { bois: 20, pierre: 20 },
  mine_or:      { bois: 25, pierre: 20 },
  mine_charbon: { bois: 15, pierre: 10 },
  production:   { bois: 20, pierre: 15 },
  commerce:     { bois: 15 },
  religieux:    { bois: 20, pierre: 10 },
  savoir:       { bois: 20, pierre: 10 },
  surveillance: { bois: 10 },
  autre:        { bois: 10 },
};

// ─── Prérequis technologiques pour certains mots-clés ────────────────────────
const TECH_REQUIREMENTS = {
  'bronze|alliage': 'bronze',
  'fer|acier':      'fer',
  'forge|fonderie': 'bronze',
};

// ─── Équipement militaire par âge tech ───────────────────────────────────────
const EQUIPMENT_BY_AGE = {
  primitif:    'aucun',
  neolithique: 'silex',
  bronze:      'bronze',
  fer:         'fer',
  classique:   'fer',
  medieval:    'acier',
  industriel:  'acier',
  moderne:     'acier avancé',
  spatial:     'technologie',
};
const EQUIPMENT_MULTIPLIER = { aucun: 1.0, silex: 1.2, bronze: 1.5, fer: 2.0, acier: 2.5, 'acier avancé': 3.0, technologie: 4.0 };

function getEquipmentLabel(age_tech) { return EQUIPMENT_BY_AGE[age_tech] || 'aucun'; }
function getMilitaryPower(army_soldiers, age_tech) {
  const equip = getEquipmentLabel(age_tech);
  return Math.round((army_soldiers || 0) * (EQUIPMENT_MULTIPLIER[equip] || 1.0));
}

// ─── Calculer la production d'une structure ───────────────────────────────────
function calculateProduction(structure, biomesMap) {
  const rateInfo = PRODUCTION_RATES[structure.category];
  if (!rateInfo || !rateInfo.resource || !(structure.workers > 0)) return { resource: null, amount: 0 };

  let amount = structure.workers * rateInfo.rate;

  // Bonus biome si la structure a des coordonnées
  if (structure.x != null && structure.y != null) {
    const biome = biomesMap[`${structure.x},${structure.y}`];
    if (biome) {
      const bonus = (BIOME_BONUS[biome.biome_type] || {})[rateInfo.resource] || 1.0;
      amount *= bonus;
    }
  }

  return { resource: rateInfo.resource, amount: Math.round(amount) };
}

// ─── Mise à jour des ressources d'une civ (tick) ─────────────────────────────
function updateResources(civ, biomesMap) {
  const stored    = parseJ(civ.resources, {});
  const resources = { ...ZERO_RESOURCES, ...stored };
  const buildings = normalizeBuildings(civ.buildings);

  const production  = {};
  const consumption = {
    nourriture: Math.round(((civ.population || 0) + (civ.army_soldiers || 0) * 0.5) * 0.15),
  };

  // Production via travailleurs affectés à des structures
  for (const struct of buildings) {
    if (!(struct.workers > 0)) continue;
    const { resource, amount } = calculateProduction(struct, biomesMap);
    if (resource && amount > 0) production[resource] = (production[resource] || 0) + amount;
  }

  // ── Cueillette de subsistance des travailleurs libres ──────────────────────
  // Les gens sans tâche affectée cueillent/chassent automatiquement selon le biome
  const activeWorkerCount = buildings.reduce((s, b) => s + (b.workers || 0), 0);
  const totalLabor        = Math.floor((civ.population || 0) * 0.6);
  const freeWorkers       = Math.max(0, totalLabor - activeWorkerCount);
  if (freeWorkers > 0 && biomesMap) {
    const capitalBiome  = biomesMap[`${civ.capital_x || 128},${civ.capital_y || 96}`];
    const biomeType     = capitalBiome?.biome_type || 'prairie';
    const foodMult      = (BIOME_BONUS[biomeType] || {}).nourriture || 0.8;
    const gathered      = Math.round(freeWorkers * 0.5 * foodMult);
    if (gathered > 0) production.nourriture = (production.nourriture || 0) + gathered;
    // Ramassage de bois en forêt
    if (['temperate_forest', 'tropical_forest'].includes(biomeType)) {
      const woodGather = Math.round(freeWorkers * 0.2);
      if (woodGather > 0) production.bois = (production.bois || 0) + woodGather;
    }
  }

  // Appliquer production
  for (const [res, amt] of Object.entries(production)) {
    resources[res] = Math.min(9999, (resources[res] || 0) + amt);
  }

  // Appliquer consommation
  for (const [res, amt] of Object.entries(consumption)) {
    resources[res] = Math.max(0, (resources[res] || 0) - amt);
  }

  const isFamine = resources.nourriture <= 0;
  const surplus  = (production.nourriture || 0) - (consumption.nourriture || 0);

  const pop      = civ.population || 0;
  const capacity = getTerritoryCapacity(civ, biomesMap);
  const overPop  = capacity > 0 && pop > capacity;   // surpopulation
  const overRatio = capacity > 0 ? pop / capacity : 1; // ex: 1.5 = 50% au-dessus de la capacité

  // Naissances bloquées si surpopulation (>100% capacité) ou nourriture insuffisante
  const canBirth = resources.nourriture > 0 && surplus >= 0 && (civ.moral || 0) > 40 && !overPop;
  const births = canBirth ? Math.max(1, Math.round(pop * 0.015)) : 0;

  const naturalDeaths = Math.max(0, Math.round(pop * 0.003));

  // Famine ou déclin par surpopulation (les gens partent / meurent de maladie)
  const famineDelta = isFamine
    ? -Math.max(1, Math.round(pop * 0.05))
    : overPop
      ? -Math.max(1, Math.round(pop * Math.min(0.03, (overRatio - 1) * 0.05)))  // pression surpopulation
      : surplus < 0 ? -Math.max(1, Math.round(pop * 0.01)) : 0;

  return {
    newResources: resources,
    consequences: { births, naturalDeaths, famineDelta, surplus, production, consumption, freeWorkers },
    deaths: naturalDeaths + Math.abs(famineDelta),
    births,
    isFamine,
    capacity,
    overPop,
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function randInt(min, max)  { return Math.floor(Math.random() * (max - min + 1)) + min; }

const CITY_PREFIXES = ['Al', 'Kar', 'Sol', 'Drak', 'Ven', 'Mor', 'Tyr', 'Ash', 'Bel', 'Cal', 'Dal', 'Eth'];
const CITY_SUFFIXES = ['heim', 'aria', 'oth', 'ura', 'eon', 'is', 'ar', 'ix', 'on', 'eth', 'as', 'or'];
function randomCityName() {
  return CITY_PREFIXES[randInt(0, CITY_PREFIXES.length - 1)] + CITY_SUFFIXES[randInt(0, CITY_SUFFIXES.length - 1)];
}

// ─── Effets par catégorie ────────────────────────────────────────────────────
const CATEGORY_EFFECTS = {
  agriculture:  { produces: 'nourriture',          basePerWorker: 1.5 },
  militaire:    { produces: 'puissance_militaire',  basePerWorker: 0.1, moralBonus: 0 },
  commerce:     { produces: 'materiaux',            basePerWorker: 2.0 },
  religieux:    { produces: 'moral',                basePerWorker: 0,   moralBonus: 0.3 },
  extraction:   { produces: 'materiaux',            basePerWorker: 2.0 },
  production:   { produces: 'materiaux',            basePerWorker: 1.5 },
  defense:      { produces: 'defense_passive',      basePerWorker: 0 },
  maritime:     { produces: 'nourriture',           basePerWorker: 1.5 },
  savoir:       { produces: 'culture',              basePerWorker: 0 },
  bois:         { produces: 'materiaux',            basePerWorker: 1.5 },
  chasse:       { produces: 'nourriture',           basePerWorker: 1.2 },
  peche:        { produces: 'nourriture',           basePerWorker: 1.2 },
  surveillance: { produces: 'visibilite',           basePerWorker: 0 },
  autre:        { produces: 'divers',               basePerWorker: 0.5 },
};

// ─── Classification automatique ─────────────────────────────────────────────
function categorizeStructure(name, description) {
  const t = (name + ' ' + description).toLowerCase();
  if (/ferme|champ|culti|récolte|agricol|potager|verger|rizière|blé|maïs/.test(t))   return 'agriculture';
  if (/caserne|entraîn|combat|milit|guerr|arène|soldat|armée/.test(t))                return 'militaire';
  if (/march|comptoir|échang|bazar|commerce|boutique|bourse|négoce/.test(t))          return 'commerce';
  if (/temple|autel|sacré|prière|église|sanctuaire|rituel|culte|cathédrale/.test(t)) return 'religieux';
  if (/mine.*cuivre|cuivre.*mine/.test(t))                                             return 'mine_cuivre';
  if (/mine.*(?:fer|acier)|(?:fer|acier).*mine/.test(t))                              return 'mine_fer';
  if (/mine.*or|or.*mine/.test(t))                                                     return 'mine_or';
  if (/mine.*charbon|charbon.*mine/.test(t))                                           return 'mine_charbon';
  if (/mine|fosse|extract|gisement|carrière/.test(t))                                 return 'extraction';
  if (/forge|fonderie|fourneau|métal|atelier|production|manufact/.test(t))            return 'production';
  if (/palissade|muraille|fort(?:if)?|rempart|défens|fossé|citadelle/.test(t))        return 'defense';
  if (/port|quai|dock|embarcad|chantier naval|marina/.test(t))                        return 'maritime';
  if (/école|biblio|savoir|étude|recherch|observat|académie/.test(t))                return 'savoir';
  if (/scierie|bûcheron|bois|charpent|coupe|forêt/.test(t))                          return 'bois';
  if (/chasse|piège|gibier/.test(t))                                                   return 'chasse';
  if (/pêche|filet|poisson/.test(t))                                                   return 'peche';
  if (/guet|observ|vigie|éclaireur|surveillance/.test(t))                             return 'surveillance';
  return 'autre';
}

// ─── Normaliser le tableau buildings (migration ancien format) ───────────────
function normalizeBuildings(raw) {
  const arr = (() => { try { return JSON.parse(raw || '[]'); } catch { return []; } })();
  return arr.map(b => {
    if (typeof b === 'string') {
      return { name: b, category: categorizeStructure(b, ''), workers: 0, status: 'active', created_tick: 0 };
    }
    return b;
  });
}

// ─── Parse d'un coût en matériaux ────────────────────────────────────────────
function parseMaterialCost(str) {
  if (!str || /^(aucun|nul|0)/i.test(str.trim())) return 0;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : 0;
}

// ─── Parse d'une durée (renvoie 0 si permanent) ──────────────────────────────
function parseDuration(str) {
  if (!str || /^(perman|indéf|continu)/i.test(str.trim())) return 0;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : 3;
}

// ─── Parser les EFFETS d'une réponse LLM ────────────────────────────────────
function parseEffets(text) {
  if (!text) return [];
  const effects = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim().replace(/^[-•*]\s*/, '').replace(/\*\*/g, '');
    if (!line) continue;

    // Extraire les params entre parenthèses (dernier groupe)
    const paramMatch = line.match(/\(([^)]+)\)\s*$/);
    const params = {};
    if (paramMatch) {
      for (const part of paramMatch[1].split(',')) {
        const kv = part.trim().match(/^([^:]+):\s*(.+)$/);
        if (kv) params[kv[1].trim().toLowerCase()] = kv[2].trim();
      }
    }
    const main = line.replace(/\s*\([^)]+\)\s*$/, '').trim();

    // → ou -> (U+2192 ou ASCII)
    const arrowRe = /→|->/;

    if (/^AFFECTER\b/i.test(main)) {
      const m = main.match(/^AFFECTER\s+(\d+)\s+\S+\s+(?:→|->)\s+(.+)$/i)
               || main.match(/^AFFECTER\s+(\d+)\s+(?:→|->)\s+(.+)$/i);
      if (m) effects.push({ verb: 'AFFECTER', count: parseInt(m[1]), task: m[2].trim(), params });

    } else if (/^CR[ÉE]ER\b/i.test(main)) {
      const m = main.match(/^CR[ÉE]ER\s+(.+)$/i);
      if (m) effects.push({ verb: 'CRÉER', name: m[1].trim(), params });

    } else if (/^ENVOYER\b/i.test(main)) {
      const m = main.match(/^ENVOYER\s+(\d+)\s+\S+\s+(?:→|->)\s+(.+)$/i)
               || main.match(/^ENVOYER\s+(\d+)\s+(?:→|->)\s+(.+)$/i);
      if (m) effects.push({ verb: 'ENVOYER', count: parseInt(m[1]), destination: m[2].trim(), params });

    } else if (/^MODIFIER\b/i.test(main)) {
      const m = main.match(/^MODIFIER\s+(.+?)\s+(?:→|->)\s+(.+)$/i);
      if (m) effects.push({ verb: 'MODIFIER', target: m[1].trim(), change: m[2].trim(), params });

    } else if (/^ABANDONNER\b/i.test(main)) {
      const m = main.match(/^ABANDONNER\s+(.+)$/i);
      if (m) effects.push({ verb: 'ABANDONNER', target: m[1].trim(), params });

    } else if (/^DIPLOMATIE\b/i.test(main)) {
      const m = main.match(/^DIPLOMATIE\s+(\S+)\s+(?:→|->)\s+(.+)$/i);
      if (m) effects.push({ verb: 'DIPLOMATIE', action: m[1].trim(), target_name: m[2].trim(), params });

    } else if (/^LOI\b/i.test(main)) {
      const m = main.match(/^LOI\s+(.+)$/i);
      if (m) effects.push({ verb: 'LOI', content: m[1].trim(), params });

    } else if (/^ESPIONNER\b/i.test(main)) {
      const m = main.match(/^ESPIONNER\s+(.+)$/i);
      if (m) effects.push({ verb: 'ESPIONNER', target_name: m[1].trim(), params });

    } else if (/^ENVOYER_EMISSAIRE\b/i.test(main)) {
      const m = main.match(/^ENVOYER_EMISSAIRE\s+(.+)$/i);
      if (m) effects.push({ verb: 'ENVOYER_EMISSAIRE', target_name: m[1].trim(), params });

    } else if (/^ENVOYER_MARCHANDS\b/i.test(main)) {
      const m = main.match(/^ENVOYER_MARCHANDS\s+(.+)$/i);
      if (m) effects.push({ verb: 'ENVOYER_MARCHANDS', target_name: m[1].trim(), params });

    } else if (/^SURVEILLER_FRONTIERE\b/i.test(main)) {
      const m = main.match(/^SURVEILLER_FRONTIERE\s+(.+)$/i);
      if (m) effects.push({ verb: 'SURVEILLER_FRONTIERE', direction: m[1].trim(), params });

    } else if (/^RIEN\b/i.test(main)) {
      effects.push({ verb: 'RIEN', params });
    }
  }

  return effects;
}

// ─── Territoire de départ ────────────────────────────────────────────────────
function initTerritory(civ, biomesMap, worldId) {
  const cells = [];
  const r = 4;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const x = clamp(civ.capital_x + dx, 0, MAP_WIDTH - 1);
      const y = clamp(civ.capital_y + dy, 0, MAP_HEIGHT - 1);
      const biome = biomesMap[`${x},${y}`];
      if (biome && !OCEAN_BIOMES.includes(biome.biome_type)) cells.push({ x, y });
    }
  }
  const ins = db.prepare('INSERT OR IGNORE INTO territories (world_id, civ_id, x, y) VALUES (?,?,?,?)');
  db.transaction(() => { for (const c of cells) ins.run(worldId, civ.id, c.x, c.y); })();
  db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(cells.length, civ.id);
  return cells.length;
}

// ─── Production alimentaire du territoire ────────────────────────────────────
function computeFoodRegen(civId, worldId, biomesMap) {
  const cells = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=?').all(civId, worldId);
  let regen = 5;
  for (const c of cells) {
    const biome = biomesMap[`${c.x},${c.y}`];
    if (biome && FOOD_BIOMES.includes(biome.biome_type)) regen += biome.food_level * 0.02;
  }
  return Math.round(regen);
}

// ─── Expansion territoriale ──────────────────────────────────────────────────
function expandTerritory(civ, direction, biomesMap, worldId, amount = 5) {
  const owned = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=?').all(civ.id, worldId);
  if (!owned.length) return 0;
  const ownedSet = new Set(owned.map(c => `${c.x},${c.y}`));
  const dirVec = {
    nord: { dx: 0, dy: -1 }, sud: { dx: 0, dy: 1 }, est: { dx: 1, dy: 0 }, ouest: { dx: -1, dy: 0 },
    'nord-est': { dx: 1, dy: -1 }, 'nord_est': { dx: 1, dy: -1 },
    'nord-ouest': { dx: -1, dy: -1 }, 'nord_ouest': { dx: -1, dy: -1 },
    'sud-est': { dx: 1, dy: 1 },  'sud_est': { dx: 1, dy: 1 },
    'sud-ouest': { dx: -1, dy: 1 }, 'sud_ouest': { dx: -1, dy: 1 },
  };
  const vec = dirVec[direction] || dirVec.nord;
  const candidates = [];
  for (const cell of owned) {
    const nx = cell.x + vec.dx, ny = cell.y + vec.dy;
    if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
    if (ownedSet.has(`${nx},${ny}`)) continue;
    const biome = biomesMap[`${nx},${ny}`];
    if (!biome || OCEAN_BIOMES.includes(biome.biome_type)) continue;
    const ex = db.prepare('SELECT civ_id FROM territories WHERE world_id=? AND x=? AND y=?').get(worldId, nx, ny);
    if (!ex) candidates.push({ x: nx, y: ny });
  }
  candidates.sort((a, b) => (a.x * vec.dx + a.y * vec.dy) - (b.x * vec.dx + b.y * vec.dy));
  const toAdd = candidates.slice(0, amount);
  if (!toAdd.length) return 0;
  const ins = db.prepare('INSERT OR IGNORE INTO territories (world_id, civ_id, x, y) VALUES (?,?,?,?)');
  db.transaction(() => { for (const c of toAdd) ins.run(worldId, civ.id, c.x, c.y); })();
  db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(owned.length + toAdd.length, civ.id);
  return toAdd.length;
}

// ─── Résoudre un conflit ─────────────────────────────────────────────────────
function resolveWar(attacker, defender, worldId, events) {
  const defBuildings = normalizeBuildings(defender.buildings);
  const hasDefense = defBuildings.some(b => b.category === 'defense' && b.status === 'active');
  const murailleBonus = hasDefense ? 15 : 0;
  const atkStr = attacker.military_power + randInt(-5, 5);
  const defStr = defender.military_power + murailleBonus + randInt(-5, 5);
  const atkWins = atkStr > defStr;
  const atkLoss = Math.round(defStr * 0.3);
  const defLoss = Math.round(atkStr * 0.3);

  if (atkWins) {
    const defCells = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=? ORDER BY RANDOM() LIMIT 3').all(defender.id, worldId);
    db.transaction(() => {
      for (const c of defCells)
        db.prepare('UPDATE territories SET civ_id=? WHERE world_id=? AND x=? AND y=?').run(attacker.id, worldId, c.x, c.y);
    })();
    const aN = db.prepare('SELECT COUNT(*) as n FROM territories WHERE civ_id=? AND world_id=?').get(attacker.id, worldId).n;
    const dN = db.prepare('SELECT COUNT(*) as n FROM territories WHERE civ_id=? AND world_id=?').get(defender.id, worldId).n;
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(aN, attacker.id);
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(dN, defender.id);
    events.push({ type: 'guerre', description: `${attacker.nom} a vaincu ${defender.nom} et pris ${defCells.length} territoires !`, civ_ids: [attacker.id, defender.id] });
  } else {
    events.push({ type: 'guerre', description: `${attacker.nom} a attaqué ${defender.nom} mais a été repoussé !`, civ_ids: [attacker.id, defender.id] });
  }

  return { atkMilitaryLoss: atkLoss, defMilitaryLoss: defLoss, atkWins, atkMoralChange: atkWins ? 5 : -8, defMoralChange: atkWins ? -10 : 5 };
}

// ─── Résoudre un effet parsé ──────────────────────────────────────────────────
function resolveEffect(effect, civ, allCivs, worldId, biomesMap, events, currentTick) {
  const updates = {};
  const buildings = normalizeBuildings(civ.buildings);

  // Calcul main-d'œuvre libre
  const activeWorkers = buildings.reduce((s, b) => s + (b.workers || 0), 0);
  const constructionRow = db.prepare(
    "SELECT COALESCE(SUM(workers),0) as total FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'"
  ).get(civ.id, worldId);
  const constructionWorkers = constructionRow ? constructionRow.total : 0;
  const totalLabor    = Math.floor((civ.population || 0) * 0.6);
  const freeWorkforce = Math.max(0, totalLabor - activeWorkers - constructionWorkers);

  switch (effect.verb) {

    case 'AFFECTER': {
      const count = Math.min(effect.count || 0, freeWorkforce);
      console.log(`[PARSE] AFFECTER ${effect.count || 0} → ${effect.task} | libre: ${freeWorkforce} → réel: ${count}`);
      if (count <= 0) {
        console.log(`[ECHEC] main-d'œuvre libre insuffisante (libre: ${freeWorkforce})`);
        events.push({ type: 'echec', description: `${civ.nom} : pas assez de main-d'œuvre libre pour "${effect.task}" (libre: ${freeWorkforce}).`, civ_ids: [civ.id] });
        break;
      }

      // Recrutement militaire
      if (/arm[eé]e|soldat|recrut/i.test(effect.task || '')) {
        updates.population    = Math.max(0, (civ.population || 0) - count);
        updates.army_soldiers = (civ.army_soldiers || 0) + count;
        updates.military_power = getMilitaryPower(updates.army_soldiers, civ.age_tech);
        console.log(`[APPLIED] recrutement: ${count} soldats | army: ${updates.army_soldiers} | power: ${updates.military_power}`);
        events.push({ type: 'recrutement', description: `${civ.nom} recrute ${count} soldats. Population -${count}, armée +${count}.`, civ_ids: [civ.id] });
        break;
      }

      const cost = parseMaterialCost(effect.params.ressources || '');
      if (cost > 0) {
        const resources = parseJ(civ.resources, ZERO_RESOURCES);
        const boisAvail  = resources.bois || 0;
        if (boisAvail < cost) {
          console.log(`[ECHEC] bois insuffisant — besoin: ${cost}, dispo: ${boisAvail}`);
          events.push({ type: 'echec', description: `${civ.nom} : pas assez de bois pour affecter des travailleurs (besoin: ${cost}).`, civ_ids: [civ.id] });
          break;
        }
        resources.bois = boisAvail - cost;
        updates.resources = JSON.stringify(resources);
        console.log(`[APPLIED] bois: ${boisAvail} → ${resources.bois} (-${cost})`);
      }

      const taskName = effect.task;
      const category = categorizeStructure(taskName, '');

      // Chercher tâche existante par correspondance de nom
      const existingIdx = buildings.findIndex(b =>
        b.name.toLowerCase().startsWith(taskName.toLowerCase().split(' ').slice(0, 2).join(' '))
      );
      if (existingIdx >= 0) {
        buildings[existingIdx].workers = count;
      } else {
        buildings.push({ name: taskName, category, workers: count, status: 'task', created_tick: currentTick });
      }
      updates.buildings = JSON.stringify(buildings);

      events.push({ type: 'affectation', description: `${civ.nom} affecte ${count} personnes → ${taskName}.`, civ_ids: [civ.id] });
      break;
    }

    case 'CRÉER': {
      // Parser le nombre de constructeurs — utiliser au minimum 1 si du monde est libre
      const askedWorkers = parseInt(effect.params.personnes || effect.params.workers || '0') || 0;
      const cWorkers = freeWorkforce > 0
        ? Math.min(askedWorkers > 0 ? askedWorkers : Math.min(10, freeWorkforce), freeWorkforce)
        : 0;
      const durStr   = effect.params['durée'] || effect.params.duree || '3 ticks';
      const ticks    = Math.min(12, Math.max(3, parseDuration(durStr) || 5)); // 3-12 ticks
      const category = categorizeStructure(effect.name, '');
      const costs    = CREATION_COSTS[category] || {};

      console.log(`[PARSE] CRÉER ${effect.name} | cat: ${category} | coûts: ${JSON.stringify(costs)} | personnes: ${cWorkers} | durée: ${ticks} ticks`);

      // Vérification prérequis technologiques
      for (const [keywords, reqAge] of Object.entries(TECH_REQUIREMENTS)) {
        if (!new RegExp(keywords, 'i').test(effect.name)) continue;
        const hasTech = TECH_AGES.indexOf(civ.age_tech) >= TECH_AGES.indexOf(reqAge);
        if (!hasTech) {
          console.log(`[ECHEC] Technologie requise: ${reqAge} (actuel: ${civ.age_tech})`);
          events.push({ type: 'echec', description: `${civ.nom}: technologie insuffisante pour "${effect.name}" (requiert âge ${reqAge}).`, civ_ids: [civ.id] });
          break;
        }
      }

      // --- Bug 8 : Détection de doublon ---
      const nameParts = effect.name.toLowerCase().split(' ').slice(0, 2).join(' ');
      const existingIdx = buildings.findIndex(b =>
        b.name.toLowerCase().includes(nameParts) ||
        nameParts.includes(b.name.toLowerCase().split(' ').slice(0, 2).join(' '))
      );
      if (existingIdx >= 0) {
        const existing = buildings[existingIdx];
        const addW = Math.min(cWorkers, freeWorkforce);
        if (addW > 0) { buildings[existingIdx].workers = (existing.workers || 0) + addW; updates.buildings = JSON.stringify(buildings); }
        console.log(`[DOUBLON] "${effect.name}" → renforcement de "${existing.name}" (+${addW} personnes)`);
        events.push({ type: 'renforcement', description: `${civ.nom} renforce "${existing.name}" (+${addW} personnes) au lieu d'en créer un doublon.`, civ_ids: [civ.id] });
        break;
      }

      // Vérification des ressources multi
      const resources = parseJ(civ.resources, ZERO_RESOURCES);
      for (const [res, amt] of Object.entries(costs)) {
        if ((resources[res] || 0) < amt) {
          console.log(`[ECHEC] ${res} insuffisant — besoin: ${amt}, dispo: ${resources[res] || 0}`);
          events.push({ type: 'echec', description: `${civ.nom} voulait construire "${effect.name}" mais manque de ${res} (besoin: ${amt}, dispo: ${resources[res] || 0}).`, civ_ids: [civ.id] });
          break;
        }
      }
      // Vérifier qu'on a passé le loop sans break (toutes ressources ok)
      let hasMissingRes = false;
      for (const [res, amt] of Object.entries(costs)) {
        if ((resources[res] || 0) < amt) { hasMissingRes = true; break; }
      }
      if (hasMissingRes) break;

      // --- Vérification des dépendances ---
      let tickPenalty = 0;
      for (const [keywords, requiredCat] of Object.entries(DEPENDENCIES)) {
        if (!new RegExp(keywords, 'i').test(effect.name)) continue;
        const hasDep = buildings.some(b => b.category === requiredCat && b.status === 'active');
        if (hasDep) continue;
        tickPenalty += 2;
        console.log(`[DEP] Prérequis manquant (${requiredCat}) → qualité réduite`);
        events.push({ type: 'malus', description: `${civ.nom} construit "${effect.name}" sans infrastructure adaptée (${requiredCat} manquant) — qualité réduite.`, civ_ids: [civ.id] });
      }
      const finalTicks = ticks + tickPenalty;

      // Déduire les ressources
      for (const [res, amt] of Object.entries(costs)) {
        resources[res] = Math.max(0, (resources[res] || 0) - amt);
      }
      updates.resources = JSON.stringify(resources);
      const costSummary = Object.entries(costs).map(([r, a]) => `-${a} ${r}`).join(', ');
      console.log(`[APPLIED] ressources déduites: ${costSummary || 'aucune'} | durée: ${finalTicks} ticks`);

      // Vérification géographique pour maritime
      if (category === 'maritime') {
        const coastTile = db.prepare(
          "SELECT t.x FROM territories t JOIN biomes b ON b.x=t.x AND b.y=t.y AND b.world_id=? WHERE t.civ_id=? AND b.biome_type IN ('coast','ocean','shallow_water','reef') LIMIT 1"
        ).get(worldId, civ.id);
        if (!coastTile) {
          console.log(`[ECHEC] ${effect.name} nécessite un accès côtier`);
          events.push({ type: 'echec', description: `${civ.nom} voulait construire "${effect.name}" mais n'a pas accès à la côte.`, civ_ids: [civ.id] });
          break;
        }
      }

      db.prepare('INSERT INTO civ_processes (civ_id, world_id, type, target, progress, max_ticks, workers) VALUES (?,?,?,?,?,?,?)')
        .run(civ.id, worldId, 'construction', effect.name, 0, finalTicks, cWorkers);

      events.push({ type: 'construction', description: `${civ.nom} commence la construction de "${effect.name}" (${finalTicks} ticks, ${cWorkers} constructeurs).`, civ_ids: [civ.id] });
      break;
    }

    case 'ENVOYER': {
      const count = Math.min(effect.count || 0, freeWorkforce);
      console.log(`[PARSE] ENVOYER ${effect.count || 0} → ${effect.destination} | réel: ${count}`);
      if (count <= 0) { console.log(`[ECHEC] main-d'œuvre libre insuffisante`); break; }
      const durStr = effect.params['durée'] || effect.params.duree || '2 ticks';
      const ticks  = Math.min(8, Math.max(2, parseDuration(durStr) || 3)); // 2-8 ticks
      const dest   = effect.destination || '';

      if (/explor|reconnaiss/.test(dest.toLowerCase())) {
        const dirMatch = dest.match(/nord[-_]est|nord[-_]ouest|sud[-_]est|sud[-_]ouest|nord|sud|est|ouest/i);
        const dir = dirMatch ? dirMatch[0].toLowerCase().replace('-', '_') : 'nord';
        db.prepare('INSERT INTO civ_processes (civ_id, world_id, type, target, progress, max_ticks, workers) VALUES (?,?,?,?,?,?,?)')
          .run(civ.id, worldId, 'exploration', dir, 0, ticks, count);
        events.push({ type: 'exploration', description: `${civ.nom} envoie ${count} éclaireurs vers ${dest}.`, civ_ids: [civ.id] });
      } else if (/colonie|colon/.test(dest.toLowerCase())) {
        if ((civ.population || 0) >= 150 && (civ.materials || 0) >= 50) {
          updates.materials  = (civ.materials  || 0) - 50;
          updates.population = Math.max(50, (civ.population || 0) - count);
          const dirMatch = dest.match(/nord|sud|est|ouest/i);
          const dir = dirMatch ? dirMatch[0].toLowerCase() : 'nord';
          expandTerritory({ ...civ, ...updates }, dir, biomesMap, worldId, 10);
          events.push({ type: 'colonisation', description: `${civ.nom} fonde une colonie vers ${dest} avec ${count} colons.`, civ_ids: [civ.id] });
        }
      } else {
        db.prepare('INSERT INTO civ_processes (civ_id, world_id, type, target, progress, max_ticks, workers) VALUES (?,?,?,?,?,?,?)')
          .run(civ.id, worldId, 'mission', dest, 0, ticks, count);
        events.push({ type: 'mission', description: `${civ.nom} envoie ${count} personnes → ${dest}.`, civ_ids: [civ.id] });
      }
      break;
    }

    case 'MODIFIER': {
      const idx = buildings.findIndex(b =>
        b.name.toLowerCase().includes((effect.target || '').toLowerCase().split(' ')[0])
      );
      if (idx >= 0) {
        const countMatch = (effect.change || '').match(/(\d+)/);
        if (countMatch) {
          const newW = Math.min(parseInt(countMatch[1]), freeWorkforce + (buildings[idx].workers || 0));
          buildings[idx].workers = newW;
        }
        buildings[idx].category = categorizeStructure(buildings[idx].name + ' ' + (effect.change || ''), '');
        updates.buildings = JSON.stringify(buildings);
        events.push({ type: 'modification', description: `${civ.nom} modifie "${effect.target}" → ${effect.change}.`, civ_ids: [civ.id] });
      }
      break;
    }

    case 'ABANDONNER': {
      const idx = buildings.findIndex(b =>
        b.name.toLowerCase().includes((effect.target || '').toLowerCase().split(' ')[0])
      );
      if (idx >= 0) {
        buildings.splice(idx, 1);
        updates.buildings = JSON.stringify(buildings);
        events.push({ type: 'abandon', description: `${civ.nom} abandonne "${effect.target}". Les travailleurs sont libérés.`, civ_ids: [civ.id] });
      } else {
        // Chercher un processus en cours
        const word = (effect.target || '').split(' ')[0];
        const proc = db.prepare("SELECT * FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours' AND target LIKE ?")
          .get(civ.id, worldId, `%${word}%`);
        if (proc) {
          db.prepare("UPDATE civ_processes SET state='annule' WHERE id=?").run(proc.id);
          events.push({ type: 'abandon', description: `${civ.nom} annule la construction de "${proc.target}".`, civ_ids: [civ.id] });
        }
      }
      break;
    }

    case 'DIPLOMATIE': {
      const actionLow  = (effect.action || '').toLowerCase();
      const targetName = (effect.target_name || '').trim();
      const targetCiv  = allCivs.find(c =>
        c.nom.toLowerCase() === targetName.toLowerCase() ||
        c.nom.toLowerCase().includes(targetName.toLowerCase())
      );
      if (!targetCiv || targetCiv.id === civ.id) break;

      const pairMin = Math.min(civ.id, targetCiv.id);
      const pairMax = Math.max(civ.id, targetCiv.id);

      if (/guerre|attaque|attaquer/.test(actionLow)) {
        const result = resolveWar(civ, targetCiv, worldId, events);
        updates.military_power = Math.max(5, (civ.military_power || 0) - result.atkMilitaryLoss);
        updates.moral          = clamp((civ.moral || 70) + result.atkMoralChange, 0, 100);
        db.prepare('UPDATE civilizations SET military_power=MAX(5,military_power-?), moral=MAX(0,MIN(100,moral+?)) WHERE id=?')
          .run(result.defMilitaryLoss, result.defMoralChange, targetCiv.id);
        db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
          .run(worldId, pairMin, pairMax, 'guerre');
      } else if (/alliance/.test(actionLow)) {
        db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
          .run(worldId, pairMin, pairMax, 'alliance');
        events.push({ type: 'diplomatie', description: `${civ.nom} propose une alliance à ${targetCiv.nom} !`, civ_ids: [civ.id, targetCiv.id] });
      } else if (/commerce/.test(actionLow)) {
        db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
          .run(worldId, pairMin, pairMax, 'commerce');
        const tradeRes = parseJ(civ.resources, ZERO_RESOURCES);
        tradeRes.or = Math.min(9999, (tradeRes.or || 0) + 10);
        updates.resources = JSON.stringify(tradeRes);
        events.push({ type: 'diplomatie', description: `${civ.nom} ouvre une route commerciale avec ${targetCiv.nom}.`, civ_ids: [civ.id, targetCiv.id] });
      } else if (/paix/.test(actionLow)) {
        db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
          .run(worldId, pairMin, pairMax, 'neutre');
        events.push({ type: 'diplomatie', description: `${civ.nom} propose la paix à ${targetCiv.nom}.`, civ_ids: [civ.id, targetCiv.id] });
      } else if (/pillage|piller/.test(actionLow)) {
        const stolenFood = randInt(20, 50);
        const stolenBois = randInt(10, 20);
        const myRes = parseJ(civ.resources, ZERO_RESOURCES);
        myRes.nourriture = Math.min(9999, (myRes.nourriture || 0) + stolenFood);
        myRes.bois       = Math.min(9999, (myRes.bois || 0) + stolenBois);
        updates.resources = JSON.stringify(myRes);
        const tgtRes = parseJ(targetCiv.resources, ZERO_RESOURCES);
        tgtRes.nourriture = Math.max(0, (tgtRes.nourriture || 0) - stolenFood);
        db.prepare('UPDATE civilizations SET resources=?, moral=MAX(0,moral-5) WHERE id=?').run(JSON.stringify(tgtRes), targetCiv.id);
        db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
          .run(worldId, pairMin, pairMax, 'guerre');
        events.push({ type: 'pillage', description: `${civ.nom} pille ${targetCiv.nom} et vole ${stolenFood} nourriture et ${stolenBois} bois !`, civ_ids: [civ.id, targetCiv.id] });
      }
      break;
    }

    case 'LOI': {
      const content = (effect.content || '').toLowerCase();
      let moralChange = 5;
      if (/repression|punition|esclavage|imp[oô]t|couvre-feu/.test(content)) moralChange = -5;
      else if (/libert[eé]|f[eê]te|remise|paix|gr[aâ]ce/.test(content))       moralChange = 5;
      updates.moral = clamp((civ.moral || 70) + moralChange, 0, 100);
      events.push({ type: 'loi', description: `${civ.nom} promulgue : "${effect.content}". Moral ${moralChange >= 0 ? '+' : ''}${moralChange}.`, civ_ids: [civ.id] });
      break;
    }

    case 'ESPIONNER': {
      const targetName = effect.target_name || '';
      const askedW     = parseInt(effect.params.personnes || '5') || 5;
      const spyCount   = Math.min(askedW, freeWorkforce, 15);
      if (spyCount <= 0) {
        events.push({ type: 'echec', description: `${civ.nom} : pas assez de gens pour espionner "${targetName}".`, civ_ids: [civ.id] });
        break;
      }
      const durTicks = Math.max(3, Math.min(8, parseDuration(effect.params['durée'] || '5 ticks') || 5));
      const targetCiv = allCivs.find(c =>
        c.nom.toLowerCase() === targetName.toLowerCase() ||
        c.nom.toLowerCase().includes(targetName.toLowerCase())
      );
      const targetId  = targetCiv?.id || 0;
      db.prepare("INSERT INTO civ_processes (civ_id, world_id, type, target, max_ticks, state, workers) VALUES (?,?,?,?,?,?,?)")
        .run(civ.id, worldId, 'espionnage', targetName + (targetId ? `|${targetId}` : ''), durTicks, 'en_cours', spyCount);
      events.push({ type: 'mission', description: `${civ.nom} envoie ${spyCount} espions vers ${targetName || '?'}.`, civ_ids: [civ.id] });
      break;
    }

    case 'ENVOYER_EMISSAIRE': {
      const targetName = effect.target_name || '';
      const askedW     = parseInt(effect.params.personnes || '3') || 3;
      const emCount    = Math.min(askedW, freeWorkforce, 10);
      if (emCount <= 0) { break; }
      const durTicks = Math.max(3, Math.min(6, parseDuration(effect.params['durée'] || '4 ticks') || 4));
      const targetCiv = allCivs.find(c =>
        c.nom.toLowerCase() === targetName.toLowerCase() ||
        c.nom.toLowerCase().includes(targetName.toLowerCase())
      );
      const targetId  = targetCiv?.id || 0;
      db.prepare("INSERT INTO civ_processes (civ_id, world_id, type, target, max_ticks, state, workers) VALUES (?,?,?,?,?,?,?)")
        .run(civ.id, worldId, 'emissaire', targetName + (targetId ? `|${targetId}` : ''), durTicks, 'en_cours', emCount);
      events.push({ type: 'mission', description: `${civ.nom} envoie ${emCount} émissaires vers ${targetName || '?'}.`, civ_ids: [civ.id] });
      break;
    }

    case 'ENVOYER_MARCHANDS': {
      const targetName = effect.target_name || '';
      const askedW     = parseInt(effect.params.personnes || '10') || 10;
      const mCount     = Math.min(askedW, freeWorkforce, 30);
      if (mCount <= 0) { break; }
      const durTicks = Math.max(3, Math.min(7, parseDuration(effect.params['durée'] || '5 ticks') || 5));
      const targetCiv = allCivs.find(c =>
        c.nom.toLowerCase() === targetName.toLowerCase() ||
        c.nom.toLowerCase().includes(targetName.toLowerCase())
      );
      const targetId  = targetCiv?.id || 0;
      db.prepare("INSERT INTO civ_processes (civ_id, world_id, type, target, max_ticks, state, workers) VALUES (?,?,?,?,?,?,?)")
        .run(civ.id, worldId, 'commerce_expedition', targetName + (targetId ? `|${targetId}` : ''), durTicks, 'en_cours', mCount);
      events.push({ type: 'mission', description: `${civ.nom} envoie ${mCount} marchands vers ${targetName || '?'}.`, civ_ids: [civ.id] });
      break;
    }

    case 'SURVEILLER_FRONTIERE': {
      const direction  = effect.direction || 'nord';
      const askedW     = parseInt(effect.params.personnes || '5') || 5;
      const guardCount = Math.min(askedW, freeWorkforce);
      if (guardCount <= 0) { break; }
      const structName = `poste de surveillance ${direction}`;
      const cat = 'surveillance';
      const nameParts  = structName.toLowerCase().split(' ').slice(0, 3).join(' ');
      const existingIdx = buildings.findIndex(b => b.name.toLowerCase().includes('surveillance') && b.name.toLowerCase().includes(direction));
      if (existingIdx >= 0) {
        buildings[existingIdx].workers = (buildings[existingIdx].workers || 0) + guardCount;
      } else {
        buildings.push({ name: structName, category: cat, workers: guardCount, status: 'active', created_tick: currentTick });
      }
      updates.buildings = JSON.stringify(buildings);
      events.push({ type: 'construction', description: `${civ.nom} établit un poste de surveillance vers le ${direction} (${guardCount} gardes).`, civ_ids: [civ.id] });
      break;
    }

    case 'RIEN':
    default:
      break;
  }

  return updates;
}

// ─── Dépendances logiques (mots-clés → catégorie requise) ────────────────────
const DEPENDENCIES = {
  'bateau|navire|flotte|galère|drakkar|radeau':  'maritime',
  'épée|armure|forge|métal|bouclier|casque':     'production',
  'cavalier|cavalerie|cheval|monture':            'agriculture',
  'bronze|cuivre|acier|fer forgé':               'extraction',
  'pain|bière|farine|moulin':                    'agriculture',
};

// ─── Découverte par adjacence des territoires ────────────────────────────────
// Retourne la liste des civ_ids nouvellement découverts par civId
function discoverAdjacentCivs(civId, worldId, allCivIds) {
  const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };
  const civ = db.prepare('SELECT discovered_civ_ids FROM civilizations WHERE id=?').get(civId);
  if (!civ) return [];
  const known = new Set(parseJ(civ.discovered_civ_ids, []));
  const newlyFound = [];

  // Cases du territoire de cette civ + cases adjacentes
  const owned = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=?').all(civId, worldId);
  const dirs  = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];

  for (const cell of owned) {
    for (const d of dirs) {
      const nx = cell.x + d.dx, ny = cell.y + d.dy;
      const neighbor = db.prepare(
        'SELECT civ_id FROM territories WHERE world_id=? AND x=? AND y=? AND civ_id != ?'
      ).get(worldId, nx, ny, civId);
      if (neighbor && !known.has(neighbor.civ_id) && allCivIds.includes(neighbor.civ_id)) {
        known.add(neighbor.civ_id);
        newlyFound.push(neighbor.civ_id);
      }
    }
  }

  if (newlyFound.length > 0) {
    db.prepare('UPDATE civilizations SET discovered_civ_ids=? WHERE id=?')
      .run(JSON.stringify([...known]), civId);
  }
  return newlyFound;
}

// ─── Emoji par catégorie (logs + frontend) ───────────────────────────────────
const CATEGORY_EMOJI = {
  agriculture: '🌾', militaire: '⚔️', commerce: '🏪', religieux: '🛕',
  extraction: '⛏️', production: '🔨', defense: '🏰', maritime: '⚓',
  savoir: '📚', bois: '🪓', chasse: '🏹', peche: '🎣',
  surveillance: '👁️', autre: '🏠',
};

// ─── Cellule de bordure pour positionner une structure ───────────────────────
function pickBorderCell(civId, worldId) {
  const owned = db.prepare('SELECT x, y FROM territories WHERE civ_id=? AND world_id=?').all(civId, worldId);
  if (!owned.length) return null;
  const ownedSet = new Set(owned.map(c => `${c.x},${c.y}`));
  const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 }];
  const border = owned.filter(cell => dirs.some(d => !ownedSet.has(`${cell.x + d.dx},${cell.y + d.dy}`)));
  const pool = border.length ? border : owned;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Avancer les processus actifs ────────────────────────────────────────────
function advanceProcesses(civId, worldId, currentBuildingsRaw, biomesMap, civRow) {
  const procs = db.prepare("SELECT * FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'").all(civId, worldId);
  const completed = [];
  const updates   = {};
  const buildings = normalizeBuildings(currentBuildingsRaw);

  for (const proc of procs) {
    const newProg = proc.progress + 1;
    if (newProg >= proc.max_ticks) {
      db.prepare("UPDATE civ_processes SET state='termine', progress=? WHERE id=?").run(newProg, proc.id);
      completed.push(proc);

      if (proc.type === 'construction') {
        // Positionner la structure sur une cellule de bordure
        const pos = pickBorderCell(civId, worldId);
        const cat = categorizeStructure(proc.target, '');
        // Les constructeurs deviennent automatiquement les premiers travailleurs du bâtiment
        const autoWorkers = proc.workers || 0;
        const newStruct = {
          name: proc.target, category: cat, workers: autoWorkers,
          status: 'active', created_tick: proc.progress,
          x: pos?.x, y: pos?.y,
        };
        buildings.push(newStruct);
        updates.buildings = JSON.stringify(buildings);

        // Expansion territoriale (2 cases autour de la nouvelle structure)
        if (biomesMap && civRow) {
          const dirs = ['nord', 'sud', 'est', 'ouest'];
          const dir = dirs[Math.floor(Math.random() * dirs.length)];
          const added = expandTerritory(civRow, dir, biomesMap, worldId, 2);
          completed[completed.length - 1] = { ...proc, territory_added: added };
          console.log(`[APPLIED] structure ajoutée: ${CATEGORY_EMOJI[cat] || '🏠'} ${proc.target} @ (${pos?.x},${pos?.y}) | territoire +${added}`);
        }

        // Bonus à la complétion par catégorie
        if (cat === 'militaire') updates._military_bonus = 20;
        if (cat === 'religieux') updates._moral_bonus    = 10;
        if (cat === 'defense')   updates._defense_bonus  = 15;
      }

      if (proc.type === 'exploration' && biomesMap && civRow) {
        const workers = proc.workers || 5;
        const gain  = workers <= 10 ? 5 : workers <= 30 ? 5 + Math.floor((workers-10)*0.5) : workers <= 100 ? 15 + Math.floor((workers-30)*0.3) : 36 + Math.floor((workers-100)*0.1);
        const added = expandTerritory(civRow, proc.target, biomesMap, worldId, gain);
        completed[completed.length - 1] = { ...proc, territory_added: added };
        db.prepare('UPDATE civilizations SET last_exploration_tick=? WHERE id=?').run(newProg, civId);
      }

      if (proc.type === 'espionnage') {
        const parts = proc.target.split('|');
        const targetId = parseInt(parts[1] || '0');
        // La résolution sera faite dans civEngine avec accès à allCivs
        completed[completed.length - 1] = { ...proc, resolve_type: 'espionnage', target_civ_id: targetId };
      }

      if (proc.type === 'emissaire') {
        const targetId = parseInt((proc.target.split('|')[1]) || '0');
        completed[completed.length - 1] = { ...proc, resolve_type: 'emissaire', target_civ_id: targetId };
      }

      if (proc.type === 'commerce_expedition') {
        const targetId = parseInt((proc.target.split('|')[1]) || '0');
        completed[completed.length - 1] = { ...proc, resolve_type: 'commerce_expedition', target_civ_id: targetId };
      }
    } else {
      db.prepare('UPDATE civ_processes SET progress=? WHERE id=?').run(newProg, proc.id);
    }
  }

  return { completed, updates };
}

// ─── Construire le contexte pour le LLM ──────────────────────────────────────
function buildCivContext(civ, allCivs, worldId, currentTick, biomesMap) {
  const valeurs   = parseJ(civ.valeurs, []);
  const buildings = normalizeBuildings(civ.buildings);

  // Ressources actuelles
  const storedRes = parseJ(civ.resources, {});
  const currentResources = { ...ZERO_RESOURCES, ...storedRes };

  // Calcul production/consommation par ressource
  const productionByRes = {};
  const consumptionByRes = {
    nourriture: Math.round(((civ.population || 0) + (civ.army_soldiers || 0) * 0.5) * 0.15),
  };
  for (const struct of buildings) {
    if (!(struct.workers > 0)) continue;
    const { resource, amount } = calculateProduction(struct, biomesMap);
    if (resource && amount > 0) productionByRes[resource] = (productionByRes[resource] || 0) + amount;
  }
  const resourceBilan = {};
  for (const res of RESOURCES) {
    const prod = productionByRes[res] || 0;
    const cons = consumptionByRes[res] || 0;
    resourceBilan[res] = { stock: currentResources[res] || 0, production: prod, consumption: cons, balance: prod - cons };
  }

  const isFamine   = currentResources.nourriture <= 0;
  const surplus    = resourceBilan.nourriture.balance;
  const popTrend   = surplus > 10 ? 'croissance' : surplus >= 0 ? 'stable' : 'déclin';
  const foodStatus = isFamine ? 'famine' : surplus < 0 ? 'deficit' : surplus > 20 ? 'excedent' : 'stable';

  // Voisins
  const diplomacyRows = db.prepare('SELECT * FROM diplomacy WHERE world_id=? AND (civ_a_id=? OR civ_b_id=?)').all(worldId, civ.id, civ.id);
  const relMap = {};
  for (const d of diplomacyRows) relMap[d.civ_a_id === civ.id ? d.civ_b_id : d.civ_a_id] = d.relation;

  // Brouillard de guerre : uniquement les civs explicitement découvertes
  const discoveredIds = new Set(parseJ(civ.discovered_civ_ids, []));
  const neighbors = allCivs
    .filter(c => c.id !== civ.id && c.status === 'alive' && discoveredIds.has(c.id))
    .map(c => ({
      id: c.id, nom: c.nom, age_tech: c.age_tech, military_power: c.military_power,
      relation: relMap[c.id] || 'neutre',
      distance: Math.abs(c.capital_x - civ.capital_x) + Math.abs(c.capital_y - civ.capital_y),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);

  // Processus actifs
  const active_processes = db.prepare("SELECT * FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'")
    .all(civ.id, worldId)
    .map(p => ({ type: p.type, target: p.target, progress: p.progress, max_ticks: p.max_ticks, workers: p.workers }));

  // Main-d'œuvre libre
  const activeWorkers     = buildings.reduce((s, b) => s + (b.workers || 0), 0);
  const constructionRow   = db.prepare("SELECT COALESCE(SUM(workers),0) as total FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'").get(civ.id, worldId);
  const constructionWorkers = constructionRow ? constructionRow.total : 0;
  const totalLabor        = Math.floor((civ.population || 0) * 0.6);
  const free_workforce    = Math.max(0, totalLabor - activeWorkers - constructionWorkers);

  // Structures actives lisibles avec production
  const structures = buildings.map(b => {
    const rateInfo = PRODUCTION_RATES[b.category];
    const resource = rateInfo?.resource || null;
    const prod_per_tick = resource ? Math.round((b.workers || 0) * (rateInfo.rate || 0)) : 0;
    return {
      name: b.name, category: b.category, workers: b.workers || 0, status: b.status || 'active',
      production: resource || 'divers',
      prod_per_tick,
    };
  });

  // Biomes du territoire
  const terrCells = db.prepare('SELECT t.x, t.y FROM territories t WHERE t.civ_id=? AND t.world_id=?').all(civ.id, worldId);
  const terrSet   = new Set(terrCells.map(c => `${c.x},${c.y}`));
  const biomeCounts = {};
  for (const cell of terrCells) {
    const biome = biomesMap[`${cell.x},${cell.y}`];
    if (biome) biomeCounts[biome.biome_type] = (biomeCounts[biome.biome_type] || 0) + 1;
  }
  const territory_biomes = Object.entries(biomeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([bt, count]) => {
      const bonusRes = Object.entries(BIOME_BONUS[bt] || {}).filter(([, v]) => v > 1).map(([r]) => r).join(', ');
      return { biome: bt, count, produces: bonusRes || 'peu' };
    });

  // Gisements connus (hors territoire, dans un rayon de 20 cases de la capitale)
  const known_deposits = [];
  const cx = civ.capital_x || 128, cy = civ.capital_y || 96;
  for (const [key, biome] of Object.entries(biomesMap)) {
    if (terrSet.has(key)) continue;
    const deps = parseJ(biome.deposits, []);
    if (!deps.length) continue;
    const [bx, by] = key.split(',').map(Number);
    const dist = Math.abs(bx - cx) + Math.abs(by - cy);
    if (dist <= 20) {
      for (const dep of deps) known_deposits.push({ mineral: dep.type, amount: dep.amount, biome: biome.biome_type, x: bx, y: by });
    }
  }

  // Accès côtier
  const coastalTile = db.prepare(
    "SELECT t.x FROM territories t JOIN biomes b ON b.x=t.x AND b.y=t.y AND b.world_id=? WHERE t.civ_id=? AND b.biome_type IN ('coast','ocean','shallow_water','reef') LIMIT 1"
  ).get(worldId, civ.id);

  // Bilan nourriture pour compat (famine warning)
  const nb = resourceBilan.nourriture;
  const food_famine_in = nb.balance < 0 && nb.stock > 0 ? Math.ceil(nb.stock / Math.abs(nb.balance)) : null;

  // Armée
  const army_soldiers  = civ.army_soldiers || 0;
  const army_equipment = getEquipmentLabel(civ.age_tech);
  const army_power     = getMilitaryPower(army_soldiers, civ.age_tech);

  // Capacité de charge du territoire
  const territory_capacity = getTerritoryCapacity(civ, biomesMap);
  const pop_vs_capacity    = territory_capacity > 0
    ? `${civ.population}/${territory_capacity} (${Math.round(civ.population / territory_capacity * 100)}%)`
    : `${civ.population}/∞`;
  const is_overpopulated   = territory_capacity > 0 && (civ.population || 0) > territory_capacity;

  return {
    nom: civ.nom, valeurs, gouvernement: civ.gouvernement, description: civ.description,
    age_tech: civ.age_tech, population: civ.population, population_trend: popTrend,
    moral: civ.moral, food_status: foodStatus,
    // Compat ancienne API
    food_stock: nb.stock, food_production: nb.production, food_consumption: nb.consumption, food_bilan: nb.balance, food_famine_in,
    materials_level: currentResources.bois || 0, mat_production: productionByRes.bois || 0,
    // Nouveau système de ressources
    resourceBilan, army_soldiers, army_equipment, army_power,
    military_power: army_power,
    territory_count: civ.territory_count, territory_biomes, known_deposits,
    neighbors, active_processes, structures,
    is_in_decline: foodStatus === 'famine' || civ.moral < 30 || civ.population < 30,
    has_coastal: !!coastalTile,
    free_workforce,
    territory_capacity, pop_vs_capacity, is_overpopulated,
  };
}

module.exports = {
  resolveEffect, parseEffets, advanceProcesses, buildCivContext,
  initTerritory, computeFoodRegen, expandTerritory, discoverAdjacentCivs,
  getTerritoryCapacity, BIOME_CARRYING_CAPACITY,
  normalizeBuildings, categorizeStructure, calculateProduction, updateResources,
  getEquipmentLabel, getMilitaryPower,
  CATEGORY_EFFECTS, CATEGORY_EMOJI, TECH_AGES, RESOURCES, ZERO_RESOURCES,
  PRODUCTION_RATES, BIOME_BONUS, CREATION_COSTS,
};
