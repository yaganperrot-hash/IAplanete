require('dotenv').config();
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DATABASE_FILE || path.join(dataDir, 'aiplanet.db');
const _db = new DatabaseSync(dbPath);

_db.exec('PRAGMA journal_mode = WAL');
_db.exec('PRAGMA foreign_keys = ON');

// Wrapper pour normaliser lastInsertRowid (BigInt → Number) et ajouter db.transaction()
const db = {
  exec: (sql) => _db.exec(sql),

  prepare: (sql) => {
    const stmt = _db.prepare(sql);
    return {
      run: (...args) => {
        const r = stmt.run(...args);
        return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
      },
      get: (...args) => stmt.get(...args),
      all: (...args) => stmt.all(...args),
    };
  },

  // Équivalent à better-sqlite3's db.transaction()
  transaction: (fn) => {
    return (...args) => {
      _db.exec('BEGIN');
      try {
        const result = fn(...args);
        _db.exec('COMMIT');
        return result;
      } catch (err) {
        _db.exec('ROLLBACK');
        throw err;
      }
    };
  },
};

console.log(`✓ SQLite (node:sqlite) → ${dbPath}`);
module.exports = { db };
