const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

router.get('/', (req, res) => {
  const limit = parseInt(req.query.limit || '50');
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.json({ events: [] });
  const events = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT ?').all(world.id, limit)
    .map(e => ({ ...e, species_ids: parseJ(e.species_ids) }));
  res.json({ events });
});

router.get('/thoughts', (req, res) => {
  const limit = parseInt(req.query.limit || '30');
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.json({ thoughts: [] });
  const thoughts = db.prepare(`
    SELECT tl.*, s.nom as species_nom, s.color as species_color
    FROM thought_logs tl JOIN species s ON s.id = tl.species_id
    WHERE tl.world_id=? ORDER BY tl.id DESC LIMIT ?
  `).all(world.id, limit);
  res.json({ thoughts });
});

module.exports = router;
