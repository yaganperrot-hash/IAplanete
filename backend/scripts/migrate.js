require('dotenv').config();
const { db } = require('../src/config/db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS worlds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL DEFAULT 'AI Planet',
  tick INTEGER NOT NULL DEFAULT 0,
  day INTEGER NOT NULL DEFAULT 1,
  season TEXT NOT NULL DEFAULT 'printemps',
  year INTEGER NOT NULL DEFAULT 1,
  weather_state TEXT NOT NULL DEFAULT '{}',
  catastrophes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS biomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  biome_type TEXT NOT NULL,
  food_level INTEGER NOT NULL DEFAULT 50,
  water_level INTEGER NOT NULL DEFAULT 50,
  temperature INTEGER NOT NULL DEFAULT 20,
  precipitation INTEGER NOT NULL DEFAULT 50,
  UNIQUE(world_id, x, y)
);

CREATE INDEX IF NOT EXISTS idx_biomes_world ON biomes(world_id);
CREATE INDEX IF NOT EXISTS idx_biomes_xy ON biomes(x, y);

CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT 'Demo',
  params TEXT NOT NULL DEFAULT '{}',
  stats TEXT NOT NULL DEFAULT '{}',
  color TEXT NOT NULL DEFAULT '#ff4444',
  status TEXT NOT NULL DEFAULT 'alive',
  population INTEGER NOT NULL DEFAULT 0,
  description TEXT DEFAULT '',
  total_kills INTEGER NOT NULL DEFAULT 0,
  ticks_alive INTEGER NOT NULL DEFAULT 0,
  parent_species_id INTEGER REFERENCES species(id),
  created_at TEXT DEFAULT (datetime('now')),
  extinct_at TEXT
);

CREATE TABLE IF NOT EXISTS creatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  species_id INTEGER REFERENCES species(id) ON DELETE CASCADE,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  energy INTEGER NOT NULL DEFAULT 100,
  health INTEGER NOT NULL DEFAULT 100,
  age INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'alive',
  parent_id INTEGER REFERENCES creatures(id),
  last_reproduced_at INTEGER NOT NULL DEFAULT 0,
  died_at_tick INTEGER DEFAULT NULL,
  last_action TEXT DEFAULT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  died_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_creatures_species ON creatures(species_id);
CREATE INDEX IF NOT EXISTS idx_creatures_world ON creatures(world_id);
CREATE INDEX IF NOT EXISTS idx_creatures_status ON creatures(status);
CREATE INDEX IF NOT EXISTS idx_creatures_pos ON creatures(x, y);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  species_ids TEXT DEFAULT '[]',
  x INTEGER,
  y INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_world ON events(world_id);
CREATE INDEX IF NOT EXISTS idx_events_tick ON events(tick);

CREATE TABLE IF NOT EXISTS thought_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  species_id INTEGER REFERENCES species(id) ON DELETE CASCADE,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  action TEXT NOT NULL,
  raison TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_thought_logs_species ON thought_logs(species_id);

CREATE TABLE IF NOT EXISTS population_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  species_id INTEGER REFERENCES species(id) ON DELETE CASCADE,
  population INTEGER NOT NULL DEFAULT 0,
  kills_this_tick INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pophist_world ON population_history(world_id, tick);
CREATE INDEX IF NOT EXISTS idx_pophist_species ON population_history(species_id);

CREATE TABLE IF NOT EXISTS civilizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  creator_name TEXT NOT NULL DEFAULT 'Inconnu',
  valeurs TEXT NOT NULL DEFAULT '[]',
  gouvernement TEXT NOT NULL DEFAULT 'monarchie',
  description TEXT DEFAULT '',
  color TEXT NOT NULL DEFAULT '#ff4444',
  status TEXT NOT NULL DEFAULT 'alive',
  age_tech TEXT NOT NULL DEFAULT 'primitif',
  population INTEGER NOT NULL DEFAULT 100,
  moral INTEGER NOT NULL DEFAULT 70,
  food INTEGER NOT NULL DEFAULT 100,
  materials INTEGER NOT NULL DEFAULT 50,
  military_power INTEGER NOT NULL DEFAULT 10,
  territory_count INTEGER NOT NULL DEFAULT 0,
  capital_x INTEGER NOT NULL DEFAULT 128,
  capital_y INTEGER NOT NULL DEFAULT 96,
  buildings TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  died_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_civs_world ON civilizations(world_id);

CREATE TABLE IF NOT EXISTS territories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  civ_id INTEGER REFERENCES civilizations(id) ON DELETE CASCADE,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  UNIQUE(world_id, x, y)
);

CREATE INDEX IF NOT EXISTS idx_territories_world ON territories(world_id);
CREATE INDEX IF NOT EXISTS idx_territories_civ ON territories(civ_id);
CREATE INDEX IF NOT EXISTS idx_territories_xy ON territories(x, y);

CREATE TABLE IF NOT EXISTS civ_processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  civ_id INTEGER REFERENCES civilizations(id) ON DELETE CASCADE,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  progress INTEGER NOT NULL DEFAULT 0,
  max_ticks INTEGER NOT NULL DEFAULT 5,
  state TEXT NOT NULL DEFAULT 'en_cours',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_civproc_civ ON civ_processes(civ_id);

CREATE TABLE IF NOT EXISTS civ_thought_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  civ_id INTEGER REFERENCES civilizations(id) ON DELETE CASCADE,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  tick INTEGER NOT NULL,
  actions TEXT NOT NULL DEFAULT '[]',
  raison TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_civlog_civ ON civ_thought_logs(civ_id);

CREATE TABLE IF NOT EXISTS diplomacy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  civ_a_id INTEGER REFERENCES civilizations(id) ON DELETE CASCADE,
  civ_b_id INTEGER REFERENCES civilizations(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'neutre',
  UNIQUE(world_id, civ_a_id, civ_b_id)
);

CREATE TABLE IF NOT EXISTS relics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('objet', 'art', 'construction')),
  domain TEXT NOT NULL CHECK (domain IN ('outil', 'arme', 'art', 'ruines')),
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  discovered_by INTEGER REFERENCES civilizations(id) ON DELETE SET NULL,
  discovered_at_tick INTEGER,
  taken INTEGER NOT NULL DEFAULT 0 CHECK (taken IN (0, 1)),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1)),
  UNIQUE(world_id, x, y)
);

CREATE INDEX IF NOT EXISTS idx_relics_world ON relics(world_id);
CREATE INDEX IF NOT EXISTS idx_relics_discovered ON relics(discovered_by);
CREATE INDEX IF NOT EXISTS idx_relics_position ON relics(x, y);

CREATE TABLE IF NOT EXISTS animal_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  species TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('agressif', 'peureux', 'oiseau')),
  size INTEGER NOT NULL DEFAULT 1,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  respawn_x INTEGER NOT NULL,
  respawn_y INTEGER NOT NULL,
  dangerosite INTEGER NOT NULL DEFAULT 2 CHECK (dangerosite BETWEEN 1 AND 5),
  is_migratory INTEGER NOT NULL DEFAULT 0 CHECK (is_migratory IN (0, 1)),
  migration_direction TEXT CHECK (migration_direction IN ('nord', 'sud')),
  discovered_by TEXT NOT NULL DEFAULT '[]',
  last_attack_tick INTEGER NOT NULL DEFAULT 0,
  UNIQUE(world_id, x, y)
);

CREATE INDEX IF NOT EXISTS idx_animal_groups_world ON animal_groups(world_id);
CREATE INDEX IF NOT EXISTS idx_animal_groups_type ON animal_groups(type);
CREATE INDEX IF NOT EXISTS idx_animal_groups_position ON animal_groups(x, y);
CREATE INDEX IF NOT EXISTS idx_animal_groups_migratory ON animal_groups(is_migratory);
`;

// Migrations incrémentales pour les BDs existantes (idempotentes)
const ALTER_MIGRATIONS = [
  "ALTER TABLE biomes ADD COLUMN precipitation INTEGER NOT NULL DEFAULT 50",
  "ALTER TABLE species ADD COLUMN total_kills INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE species ADD COLUMN ticks_alive INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE species ADD COLUMN parent_species_id INTEGER REFERENCES species(id)",
  "ALTER TABLE creatures ADD COLUMN last_reproduced_at INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE creatures ADD COLUMN died_at_tick INTEGER DEFAULT NULL",
  "ALTER TABLE creatures ADD COLUMN last_action TEXT DEFAULT NULL",
  "ALTER TABLE creatures ADD COLUMN repro_drive INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE creatures ADD COLUMN gestation_ticks INTEGER NOT NULL DEFAULT 0",
  // Mode Civilisations
  "ALTER TABLE worlds ADD COLUMN world_type TEXT NOT NULL DEFAULT 'planet'",
  // Option B : réponse libre
  "ALTER TABLE civ_processes ADD COLUMN workers INTEGER NOT NULL DEFAULT 0",
  // Brouillard de guerre : civs découvertes (IDs JSON)
  "ALTER TABLE civilizations ADD COLUMN discovered_civ_ids TEXT NOT NULL DEFAULT '[]'",
  // Système de ressources multi (12 ressources) + armée séparée
  "ALTER TABLE civilizations ADD COLUMN resources TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE civilizations ADD COLUMN army_soldiers INTEGER NOT NULL DEFAULT 0",
  // Gisements minéraux par biome
  "ALTER TABLE biomes ADD COLUMN deposits TEXT NOT NULL DEFAULT '[]'",
  // Système de connaissance inter-civs + historique
  "ALTER TABLE civilizations ADD COLUMN knowledge_about TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE civilizations ADD COLUMN last_exploration_tick INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE civilizations ADD COLUMN last_combat_tick INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE civilizations ADD COLUMN active_trade_routes INTEGER NOT NULL DEFAULT 0",
  // Travailleurs demandés vs affectés (pour processus)
  "ALTER TABLE civ_processes ADD COLUMN requested_workers INTEGER NOT NULL DEFAULT 0",
  // V3 — Rôle et capacité logement des bâtiments
  "ALTER TABLE civ_processes ADD COLUMN role TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE civ_processes ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0",
  // V3 — Moral cumulatif + conséquences du dernier tick
  "ALTER TABLE civilizations ADD COLUMN frustration_ticks TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE civilizations ADD COLUMN last_consequences TEXT NOT NULL DEFAULT '[]'",
  // V3 — Événements actifs (épidémie, sécheresse, etc.)
  "ALTER TABLE civilizations ADD COLUMN active_events TEXT NOT NULL DEFAULT '[]'",
  // V4 — Mémoire stratégique (cap inter-ticks)
  "ALTER TABLE civilizations ADD COLUMN memoire TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE civilizations ADD COLUMN civ_memory TEXT DEFAULT '{}'",
  // V5 — Reliques : bonus temporaire
  "ALTER TABLE relics ADD COLUMN bonus_remaining INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE relics ADD COLUMN era TEXT DEFAULT 'primitif'",
  // V6 — Événements de tension par valeur
  "ALTER TABLE civilizations ADD COLUMN value_event_ticks TEXT DEFAULT '{}'",
  "ALTER TABLE civilizations ADD COLUMN energy REAL DEFAULT 0",
  "ALTER TABLE civilizations ADD COLUMN current_wish TEXT DEFAULT NULL",
  // Prompt variants experiment
  "ALTER TABLE civilizations ADD COLUMN prompt_variant TEXT DEFAULT 'V0'",
];

function migrate() {
  db.exec(SCHEMA);

  // Appliquer les colonnes supplémentaires si elles n'existent pas encore
  for (const sql of ALTER_MIGRATIONS) {
    try {
      db.exec(sql);
    } catch (e) {
      // Colonne déjà existante → ignorer
    }
  }

  // Table snapshots
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS civ_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id INTEGER NOT NULL,
      civ_id INTEGER NOT NULL,
      prompt_variant TEXT DEFAULT 'V0',
      tick INTEGER NOT NULL,
      population INTEGER DEFAULT 0,
      moral INTEGER DEFAULT 0,
      food_stock INTEGER DEFAULT 0,
      army_soldiers INTEGER DEFAULT 0,
      territory_count INTEGER DEFAULT 0,
      buildings_count INTEGER DEFAULT 0,
      nb_wars INTEGER DEFAULT 0,
      nb_alliances INTEGER DEFAULT 0,
      frustration_max INTEGER DEFAULT 0,
      captured_at TEXT DEFAULT (datetime('now'))
    )`).run();
    console.log('✓ TABLE civ_snapshots');
  } catch (e) {
    // Table déjà existante → ignorer
  }

  console.log('✓ Migrations SQLite appliquées');
}

if (require.main === module) {
  migrate();
  console.log('✓ Base de données prête');
}

module.exports = { migrate, SCHEMA };
