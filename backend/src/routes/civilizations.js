const express = require('express');
const { db } = require('../config/db');
const { initTerritory, addMemoryEntry } = require('../simulation/civActionResolver');

const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };
const parseCiv = r => r ? {
  ...r,
  valeurs:       parseJ(r.valeurs, []),
  buildings:     parseJ(r.buildings, []),
  resources:     parseJ(r.resources, {}),
  army_soldiers: r.army_soldiers || 0,
} : null;

function getCivWorld() {
  return db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
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

    const VALID_VALUES = ['expansion', 'commerce', 'guerre', 'spiritualite', 'isolationnisme',
      'liberte', 'ordre', 'survie', 'exploration', 'art', 'savoir'];
    // Validation des valeurs
    const validatedValeurs = valeurs.map(v => {
      if (VALID_VALUES.includes(v)) return v;
      console.warn(`Valeur inconnue "${v}" pour la civilisation "${nom}", remplacée par "survie".`);
      return 'survie';
    });

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
    ).run(world.id, nom.trim(), creator_name, JSON.stringify(validatedValeurs), gouvernement, description, color, capital_x, capital_y, JSON.stringify(INITIAL_RESOURCES)).lastInsertRowid;

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

// Intervention divine (dépenser de l'énergie)
router.post('/:id/intervene', (req, res) => {
  const civId = parseInt(req.params.id);
  const { type, target } = req.body;

  const INTERVENTIONS = {
    manne_nourriture: { cost: 20, description: 'Manne de nourriture', type: 'resource', delta: { nourriture: 300 } },
    manne_bois:       { cost: 15, description: 'Manne de bois', type: 'resource', delta: { bois: 200 } },
    manne_glaise:     { cost: 15, description: 'Manne de glaise', type: 'resource', delta: { glaise: 150 } },
    vision_outils:    { cost: 30, description: 'Vision des outils', type: 'vision', texte: "Vision divine : tailler le silex avec du bois permet de créer des outils tranchants durables." },
    vision_peaux:     { cost: 30, description: 'Vision des peaux', type: 'vision', texte: "Vision divine : les peaux d'animaux séchées et grattées protègent du froid." },
    vision_glaise:    { cost: 30, description: 'Vision de la glaise', type: 'vision', texte: "Vision divine : cuire la glaise au feu crée des récipients solides pour stocker nourriture et eau." },
    foudre:           { cost: 10, description: 'Foudre destructrice', type: 'punition', effet: 'destroy_building' },
    montee_eaux:      { cost: 15, description: 'Montée des eaux', type: 'punition', effet: 'flood' },
    epidemie:         { cost: 15, description: 'Épidémie', type: 'punition', effet: 'epidemic' },
  };

  if (!type || !INTERVENTIONS[type]) {
    return res.status(400).json({ error: 'Type d\'intervention invalide' });
  }

  const civ = db.prepare('SELECT * FROM civilizations WHERE id=?').get(civId);
  if (!civ) return res.status(404).json({ error: 'Civilisation introuvable' });

  const intervention = INTERVENTIONS[type];
  if (!intervention) return res.status(400).json({ error: 'Type d\'intervention inconnu' });

  if ((civ.energy || 0) < intervention.cost) {
    return res.status(400).json({ error: `Énergie divine insuffisante (${civ.energy || 0}/${intervention.cost})` });
  }

  // Dépenser l'énergie
  const newEnergy = (civ.energy || 0) - intervention.cost;
  db.prepare('UPDATE civilizations SET energy=? WHERE id=?').run(newEnergy, civId);

  // Appliquer l'effet
  let effectDescription = '';
  if (intervention.type === 'resource') {
    const current = JSON.parse(civ.resources || '{}');
    Object.entries(intervention.delta).forEach(([resource, amount]) => {
      current[resource] = (current[resource] || 0) + amount;
    });
    db.prepare('UPDATE civilizations SET resources=? WHERE id=?').run(JSON.stringify(current), civId);
    effectDescription = Object.entries(intervention.delta).map(([r, a]) => `+${a} ${r}`).join(', ');
  } else if (intervention.type === 'vision') {
    // Ajouter une entrée mémoire de type « vision »
    addMemoryEntry(civId, 'savoir', intervention.texte);
    effectDescription = `Vision : ${intervention.texte.substring(0, 50)}...`;
    // Ajouter à last_consequences
    const civRow = db.prepare('SELECT last_consequences FROM civilizations WHERE id=?').get(civId);
    const lastConsequences = parseJ(civRow.last_consequences, []);
    lastConsequences.push({ type: 'vision_divine', texte: intervention.texte });
    db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?').run(JSON.stringify(lastConsequences), civId);
  } else if (intervention.type === 'punition') {
    if (intervention.effet === 'destroy_building') {
      // Supprimer 1 bâtiment non-passif aléatoire
      const buildings = parseJ(civ.buildings, []);
      const passiveCategories = ['habitation', 'defense', 'religieux', 'surveillance'];
      const nonPassive = buildings.filter(b => {
        const cat = b.category || b.role || '';
        return !passiveCategories.includes(cat);
      });
      if (nonPassive.length > 0) {
        const randomIndex = Math.floor(Math.random() * nonPassive.length);
        const removed = nonPassive[randomIndex];
        buildings.splice(buildings.indexOf(removed), 1);
        db.prepare('UPDATE civilizations SET buildings=? WHERE id=?').run(JSON.stringify(buildings), civId);
        effectDescription = `Bâtiment détruit : ${removed.nom || removed.name || removed.role || 'inconnu'}`;
      } else {
        effectDescription = 'Aucun bâtiment non-passif à détruire';
      }
    } else if (intervention.effet === 'flood') {
      // -5% pop
      const pop = civ.population || 0;
      const loss = Math.max(1, Math.floor(pop * 0.05));
      const newPop = pop - loss;
      db.prepare('UPDATE civilizations SET population=? WHERE id=?').run(newPop, civId);
      // Supprimer 1 case territoire random
      const territory = db.prepare('SELECT x, y FROM territories WHERE civ_id=?').all(civId);
      if (territory.length > 0) {
        const randomCell = territory[Math.floor(Math.random() * territory.length)];
        db.prepare('DELETE FROM territories WHERE civ_id=? AND x=? AND y=?').run(civId, randomCell.x, randomCell.y);
        effectDescription = `Inondation : -${loss} population, territoire (${randomCell.x},${randomCell.y}) perdu`;
      } else {
        effectDescription = `Inondation : -${loss} population, aucun territoire à perdre`;
      }
    } else if (intervention.effet === 'epidemic') {
      // -10% pop
      const pop = civ.population || 0;
      const loss = Math.max(1, Math.floor(pop * 0.10));
      const newPop = pop - loss;
      db.prepare('UPDATE civilizations SET population=? WHERE id=?').run(newPop, civId);
      effectDescription = `Épidémie : -${loss} population`;
    }
  }

  // Ajouter une entrée mémoire
  addMemoryEntry(civId, 'histoire', `Intervention divine (${intervention.description}) : ${effectDescription}`);

  // Réponse
  res.json({
    success: true,
    energy_spent: intervention.cost,
    remaining_energy: newEnergy,
    effect: effectDescription,
    intervention: intervention.description,
  });
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

