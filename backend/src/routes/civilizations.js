const express = require('express');
const { db } = require('../config/db');
const { initTerritory } = require('../simulation/civActionResolver');

const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };
const parseCiv = r => r ? {
  ...r,
  valeurs:       parseJ(r.valeurs, []),
  buildings:     parseJ(r.buildings, []),
  resources:     parseJ(r.resources, {}),
  army_soldiers: r.army_soldiers || 0,
} : null;

function getCivWorld() {
  return db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' LIMIT 1").get();
}

module.exports = function createCivRouter(civEngine) {
const router = express.Router();

// Liste toutes les civs
router.get('/', (req, res) => {
  const world = getCivWorld();
  if (!world) return res.json({ civs: [] });
  const civs = db.prepare('SELECT * FROM civilizations WHERE world_id=? ORDER BY created_at DESC').all(world.id).map(parseCiv);
  res.json({ civs });
});

// Détail d'une civ
router.get('/:id', (req, res) => {
  const civ = parseCiv(db.prepare('SELECT * FROM civilizations WHERE id=?').get(req.params.id));
  if (!civ) return res.status(404).json({ error: 'Civilisation introuvable' });

  const territory = db.prepare('SELECT x, y FROM territories WHERE civ_id=?').all(civ.id);
  const processes = db.prepare("SELECT * FROM civ_processes WHERE civ_id=? AND state='en_cours'").all(civ.id);
  const thoughts = db.prepare('SELECT * FROM civ_thought_logs WHERE civ_id=? ORDER BY id DESC LIMIT 15').all(civ.id)
    .map(t => ({ ...t, actions: parseJ(t.actions, []) }));
  const events = db.prepare(
    "SELECT * FROM events WHERE json_extract(species_ids,'$[0]')=? OR json_extract(species_ids,'$[1]')=? ORDER BY id DESC LIMIT 15"
  ).all(civ.id, civ.id);
  const diplomacy = db.prepare('SELECT * FROM diplomacy WHERE civ_a_id=? OR civ_b_id=?').all(civ.id, civ.id);

  res.json({ civ, territory, processes, thoughts, events, diplomacy });
});

// Créer une civ
router.post('/', (req, res) => {
  try {
    const { nom, creator_name = 'Inconnu', valeurs = [], gouvernement = 'monarchie',
            description = '', spawn_x, spawn_y } = req.body;

    if (!nom?.trim()) return res.status(400).json({ error: 'Le nom est requis' });

    const world = getCivWorld();
    if (!world) return res.status(404).json({ error: 'Monde Civilisations introuvable. Relancez le serveur.' });

    const existing = db.prepare('SELECT id FROM civilizations WHERE world_id=? AND nom=?').get(world.id, nom.trim());
    if (existing) return res.status(400).json({ error: 'Ce nom existe déjà' });

    const VALID_GOUVERNEMENTS = ['monarchie', 'democratie', 'theocratie', 'conseil_anciens', 'dictature_militaire', 'anarchie_cooperative'];
    if (!VALID_GOUVERNEMENTS.includes(gouvernement)) return res.status(400).json({ error: 'Gouvernement invalide' });

    // Couleur unique
    const colors = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#a78bfa'];
    const usedColors = db.prepare('SELECT color FROM civilizations WHERE world_id=?').all(world.id).map(r => r.color);
    const color = colors.find(c => !usedColors.includes(c)) || `#${Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0')}`;

    // Position de départ (clamp sur la carte 256×192)
    const capital_x = Math.max(10, Math.min(245, parseInt(spawn_x) || 128));
    const capital_y = Math.max(10, Math.min(181, parseInt(spawn_y) || 96));

    const INITIAL_RESOURCES = { nourriture: 200, bois: 100, pierre: 50, glaise: 30, silex: 40, sable: 0, sel: 0, cuivre: 0, etain: 0, fer: 0, or: 0, charbon: 0 };

    const civId = db.prepare(
      'INSERT INTO civilizations (world_id, nom, creator_name, valeurs, gouvernement, description, color, capital_x, capital_y, resources) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(world.id, nom.trim(), creator_name, JSON.stringify(valeurs), gouvernement, description, color, capital_x, capital_y, JSON.stringify(INITIAL_RESOURCES)).lastInsertRowid;

    // Initialiser le territoire
    const biomes = db.prepare('SELECT x, y, biome_type FROM biomes WHERE world_id=?').all(world.id);
    const biomesMap = {};
    for (const b of biomes) biomesMap[`${b.x},${b.y}`] = b;
    const civRow = { id: civId, capital_x, capital_y };
    const territoryCount = initTerritory(civRow, biomesMap, world.id);
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(territoryCount, civId);

    // Événement de naissance
    const tick = db.prepare('SELECT tick FROM worlds WHERE id=?').get(world.id)?.tick || 0;
    db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)')
      .run(world.id, tick, 'naissance', `"${nom.trim()}" créée par ${creator_name} entre dans le monde !`, JSON.stringify([civId]));

    res.status(201).json({ civ: parseCiv(db.prepare('SELECT * FROM civilizations WHERE id=?').get(civId)) });
  } catch (err) {
    console.error('Erreur création civ:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// Territoire d'une civ
router.get('/:id/territory', (req, res) => {
  const cells = db.prepare('SELECT x, y FROM territories WHERE civ_id=?').all(req.params.id);
  res.json({ territory: cells });
});

// Reset du monde civilisations
router.post('/reset', (req, res) => {
  try {
    const world = getCivWorld();
    if (!world) return res.status(404).json({ error: 'Monde Civilisations introuvable' });

    const wid = world.id;
    db.prepare('DELETE FROM diplomacy WHERE world_id=?').run(wid);
    db.prepare('DELETE FROM civ_thought_logs WHERE civ_id IN (SELECT id FROM civilizations WHERE world_id=?)').run(wid);
    db.prepare('DELETE FROM civ_processes WHERE civ_id IN (SELECT id FROM civilizations WHERE world_id=?)').run(wid);
    db.prepare('DELETE FROM territories WHERE world_id=?').run(wid);
    db.prepare('DELETE FROM civilizations WHERE world_id=?').run(wid);
    db.prepare("DELETE FROM events WHERE world_id=? AND type != 'catastrophe'").run(wid);
    db.prepare('UPDATE worlds SET tick=0 WHERE id=?').run(wid);

    if (civEngine) civEngine.reload();

    res.json({ message: 'Monde Civilisations réinitialisé' });
  } catch (err) {
    console.error('Erreur reset civ:', err.message);
    res.status(500).json({ error: err.message });
  }
});

return router;
};

