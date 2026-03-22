const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

const parseJ = (v, fb = {}) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };
const parseSpecies = r => r ? { ...r, params: parseJ(r.params), stats: parseJ(r.stats) } : null;

function calculateStats(params) {
  const { taille = 5, regime = 'omnivore', social = 'solitaire', traits = [] } = params;
  const modRegime = { herbivore: 0.5, carnivore: 1.8, omnivore: 1.0, charognard: 0.7, insectivore: 0.8, parasite: 0.9 }[regime] || 1;
  // Modificateur reproduction : herbivore rapide, carnivore lent (inverse du modRegime combat)
  const reproRegime = { herbivore: 0.4, carnivore: 1.5, omnivore: 0.8, charognard: 0.6, insectivore: 0.5, parasite: 1.0 }[regime] || 0.8;
  const modSocial = { solitaire: 0, couple: 1, petit_groupe: 2, grande_colonie: 4 }[social] || 0;
  const hasCarapace = traits.includes('carapace');
  const hasVitesse = traits.includes('vitesse');
  const hasVol = traits.includes('vol');
  const hasEcholocation = traits.includes('echolocation');
  const hasVisionNocturne = traits.includes('vision_nocturne');
  const hasVenin = traits.includes('venin');
  const hasCamouflage = traits.includes('camouflage');
  const hasFouisseur = traits.includes('fouisseur');
  const hasMimetisme = traits.includes('mimetisme');
  const hasBioluminescence = traits.includes('bioluminescence');
  const nbTraits = traits.length;
  // Vol : vitesse +1, énergie +2, mais doit se poser pour manger
  const volBonus = hasVol ? 1 : 0;
  return {
    vitesse_reproduction: Math.max(3, Math.round(taille * 5 * reproRegime * Math.max(0.7, nbTraits * 0.3 + 0.7))),
    consommation_energie: Math.round(taille * 1.5 + (hasVitesse ? 3 : 0) + (hasVol ? 2 : 0) + (hasEcholocation ? 1 : 0) + (hasVenin ? 1 : 0) + modSocial),
    points_vie: Math.round(taille * 10 * (hasCarapace ? 1.6 : 1.0) * (hasVitesse ? 0.85 : 1.0)),
    degats: Math.round(taille * 3 * (hasVenin ? 1.6 : 1.0) * modRegime),
    portee_detection: Math.round(taille * 1.5 + (hasEcholocation ? 6 : 0) + (hasVisionNocturne ? 3 : 0) + (hasBioluminescence ? 4 : 0)),
    discretion: Math.round((10 / taille) + (hasCamouflage ? 6 : 0) + (hasFouisseur ? 3 : 0) + (hasMimetisme ? 4 : 0)),
    taille_portee: Math.max(1, Math.min(3, Math.round(6 / taille))),
    vitesse_deplacement: Math.round((hasVitesse ? 2 : 1 + volBonus) * (hasCarapace ? 0.7 : 1.0)),
  };
}

router.get('/', (req, res) => {
  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.json({ species: [] });
  const rows = db.prepare('SELECT * FROM species WHERE world_id=? ORDER BY created_at DESC').all(world.id);
  res.json({ species: rows.map(parseSpecies) });
});

router.get('/:id', (req, res) => {
  const sp = db.prepare('SELECT * FROM species WHERE id=?').get(req.params.id);
  if (!sp) return res.status(404).json({ error: 'Espèce introuvable' });

  const creatures = db.prepare("SELECT id, x, y, energy, health, age FROM creatures WHERE species_id=? AND status='alive' LIMIT 100").all(sp.id);
  const thoughts = db.prepare('SELECT tick, action, raison, created_at FROM thought_logs WHERE species_id=? ORDER BY id DESC LIMIT 10').all(sp.id);
  const eventsRows = db.prepare(
    "SELECT * FROM events WHERE json_extract(species_ids, '$[0]')=? OR json_extract(species_ids, '$[1]')=? ORDER BY id DESC LIMIT 10"
  ).all(sp.id, sp.id).map(e => ({ ...e, species_ids: parseJ(e.species_ids, []) }));

  // Historique de population (50 derniers ticks)
  const popHistory = db.prepare(
    'SELECT tick, population, kills_this_tick FROM population_history WHERE species_id=? ORDER BY tick DESC LIMIT 50'
  ).all(sp.id).reverse();

  // Chaîne alimentaire (espèces que cette espèce chasse / qui la chassent)
  const allSpecies = db.prepare('SELECT id, nom, params, color FROM species WHERE world_id=?').all(sp.params ? sp.id : 0);

  res.json({ species: parseSpecies(sp), creatures, thoughts, events: eventsRows, pop_history: popHistory });
});

router.get('/:id/population-history', (req, res) => {
  const limit = parseInt(req.query.limit || '100');
  const rows = db.prepare(
    'SELECT tick, population, kills_this_tick FROM population_history WHERE species_id=? ORDER BY tick DESC LIMIT ?'
  ).all(req.params.id, limit).reverse();
  res.json({ history: rows });
});

router.post('/', (req, res) => {
  try {
  const { nom, creator_name = 'Inconnu', milieu = 'terrestre', taille = 5, regime = 'herbivore',
    habitats = [], social = 'petit_groupe', rythme = 'diurne', traits = [], description = '' } = req.body;

  if (!nom?.trim()) return res.status(400).json({ error: 'Le nom est requis' });

  const world = db.prepare('SELECT id FROM worlds LIMIT 1').get();
  if (!world) return res.status(404).json({ error: 'Monde introuvable' });

  const existing = db.prepare('SELECT id FROM species WHERE world_id=? AND nom=?').get(world.id, nom.trim());
  if (existing) return res.status(400).json({ error: 'Ce nom existe déjà' });

  const params = { milieu, taille: parseInt(taille), regime, habitats, social, rythme, traits, description };
  const stats = calculateStats(params);

  const colors = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#84cc16','#a78bfa'];
  const usedColors = db.prepare('SELECT color FROM species WHERE world_id=?').all(world.id).map(r => r.color);
  const color = colors.find(c => !usedColors.includes(c)) || colors[Math.floor(Math.random() * colors.length)];

  const spId = db.prepare(
    'INSERT INTO species (world_id, nom, creator_name, params, stats, color, status, population, description) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(world.id, nom.trim(), creator_name, JSON.stringify(params), JSON.stringify(stats), color, 'alive', 0, description).lastInsertRowid;

  // Spawn initial
  const spawn_x = Math.max(0, Math.min(255, parseInt(req.body.spawn_x) || 128));
  const spawn_y = Math.max(0, Math.min(191, parseInt(req.body.spawn_y) || 96));
  const SPAWN_COUNT = parseInt(process.env.SPAWN_COUNT || '80');

  const biomes = db.prepare('SELECT x, y, biome_type FROM biomes WHERE world_id=?').all(world.id);
  const validBiomes = biomes
    .filter(b =>
      milieu === 'aquatique' ? ['reef', 'coast', 'ocean_deep'].includes(b.biome_type)
      : milieu === 'amphibie' ? !['ocean_deep'].includes(b.biome_type)
      : !['ocean_deep', 'ocean', 'reef'].includes(b.biome_type)
    )
    .sort((a, b) =>
      (Math.abs(a.x - spawn_x) + Math.abs(a.y - spawn_y)) -
      (Math.abs(b.x - spawn_x) + Math.abs(b.y - spawn_y))
    );

  const insertCreature = db.prepare('INSERT INTO creatures (species_id, world_id, x, y, energy, health, age, status) VALUES (?,?,?,?,?,?,?,?)');

  const spawnAll = db.transaction(() => {
    const pool = validBiomes.slice(0, Math.min(300, validBiomes.length));
    for (let i = 0; i < SPAWN_COUNT; i++) {
      const cell = pool[Math.floor(Math.random() * pool.length)];
      if (!cell) continue;
      insertCreature.run(spId, world.id, cell.x, cell.y, 80, 100, 0, 'alive');
    }
    db.prepare('UPDATE species SET population=? WHERE id=?').run(SPAWN_COUNT, spId);
    const tick = db.prepare('SELECT tick FROM worlds WHERE id=?').get(world.id)?.tick || 0;
    db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)')
      .run(world.id, tick, 'naissance', `Une nouvelle espèce est arrivée : ${nom.trim()} créée par ${creator_name} !`, JSON.stringify([spId]));
  });

  spawnAll();

  const sp = parseSpecies(db.prepare('SELECT * FROM species WHERE id=?').get(spId));
  res.status(201).json({ species: sp, stats, initialCount: SPAWN_COUNT });
  } catch (err) {
    console.error('Erreur création espèce:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

router.post('/preview-stats', (req, res) => {
  const stats = calculateStats(req.body);
  res.json({ stats });
});

module.exports = router;
