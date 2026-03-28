require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('../src/config/db');
const { migrate } = require('./migrate');
const { generateMap } = require('../src/simulation/mapGenerator');
const { initTerritory } = require('../src/simulation/civActionResolver');
const relicsPool = require('../src/data/relicsPool');
const animalsPool = require('../src/data/animalsPool');

const DEMO_CIVS = [
  {
    nom: "Les Conquérants du Feu Sacré",
    creator_name: 'Demo',
    valeurs: ['expansion', 'guerre', 'spiritualité'],
    gouvernement: 'monarchie',
    description: 'Un peuple conquérant guidé par une foi ardente, cherchant à étendre son territoire par la force et la conviction.',
    color: '#ef4444',
    capital_x: 128, capital_y: 96,
  },
  {
    nom: "Les Érudits d'Aristos",
    creator_name: 'Demo',
    valeurs: ['savoir', 'culture', 'technologie'],
    gouvernement: 'aristocratie',
    description: 'Une société d\'érudits et d\'inventeurs où le savoir et la culture priment, gouvernée par une aristocratie de sages.',
    color: '#3b82f6',
    capital_x: 50, capital_y: 50,
  },
];

function seed() {
  migrate();

  // Créer le monde civilisations
  // V3 : démarrer au tick 2 = Mars (printemps) pour éviter les morts de froid immédiates
  const worldId = db.prepare(
    "INSERT INTO worlds (nom, world_type, tick, weather_state, catastrophes) VALUES (?,?,?,?,?)"
  ).run('WorldIA Civilisations', 'civilisations', 2, '{}', '[]').lastInsertRowid;

  console.log(`✓ Monde Civilisations créé (id=${worldId})`);

  // Générer la carte (partage la même logique que AI Planet)
  // generateMap retourne { cells, width, height }
  const { cells } = generateMap(worldId);
  const insertBiome = db.prepare('INSERT OR IGNORE INTO biomes (world_id, x, y, biome_type, food_level, water_level, precipitation, deposits) VALUES (?,?,?,?,?,?,?,?)');
  const insertAllBiomes = db.transaction(() => {
    for (const b of cells) insertBiome.run(worldId, b.x, b.y, b.biome_type, b.food_level, b.water_level, b.precipitation ?? 50, JSON.stringify(b.deposits || []));
  });
  insertAllBiomes();
  console.log(`✓ Carte générée (${cells.length} biomes)`);

  // Construire biomesMap pour initTerritory
  const biomesMap = {};
  for (const b of cells) biomesMap[`${b.x},${b.y}`] = b;

  // Ressources initiales pour chaque nouvelle civilisation
  const INITIAL_RESOURCES = { nourriture: 400, bois: 150, pierre: 80, glaise: 30, silex: 40, sable: 0, sel: 0, cuivre: 0, etain: 0, fer: 0, or: 0, charbon: 0 };

  // Créer les civilisations de démo
  const colors = DEMO_CIVS.map(c => c.color);
  for (const civData of DEMO_CIVS) {
    const civId = db.prepare(
      'INSERT INTO civilizations (world_id, nom, creator_name, valeurs, gouvernement, description, color, capital_x, capital_y, resources) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).run(
      worldId, civData.nom, civData.creator_name,
      JSON.stringify(civData.valeurs), civData.gouvernement,
      civData.description, civData.color,
      civData.capital_x, civData.capital_y,
      JSON.stringify(INITIAL_RESOURCES)
    ).lastInsertRowid;

    // Initialiser le territoire de départ
    const civRow = { id: civId, capital_x: civData.capital_x, capital_y: civData.capital_y };
    const territoryCount = initTerritory(civRow, biomesMap, worldId);
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(territoryCount, civId);

    // Bâtiments de départ — la civ existait déjà avant le début de la simulation
    const startBuildings = [
      { name: 'Champs collectifs', category: 'agriculture', role: 'agriculture', workers: 15, status: 'active', capacity: 0 },
      { name: 'Huttes du peuple',  category: 'habitation',  role: 'habitation',  workers: 0,  status: 'active', capacity: 60 },
      { name: 'Camp de bûcherons', category: 'bois',        role: 'bois',        workers: 10, status: 'active', capacity: 0 },
    ];
    db.prepare('UPDATE civilizations SET buildings=? WHERE id=?')
      .run(JSON.stringify(startBuildings), civId);

    // Insérer l'événement de naissance
    db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)')
      .run(worldId, 0, 'naissance', `La civilisation "${civData.nom}" vient d'entrer dans le monde !`, JSON.stringify([civId]));

    console.log(`✓ Civ "${civData.nom}" créée (id=${civId}, territoire=${territoryCount} cases)`);
  }

  // Spawn de 10 reliques autour des civs de départ
  const occupiedCells = new Set();
  // Récupérer les territoires déjà occupés
  const territories = db.prepare('SELECT x, y FROM territories WHERE world_id = ?').all(worldId);
  for (const t of territories) occupiedCells.add(`${t.x},${t.y}`);
  // Récupérer les reliques déjà placées (au cas où)
  const existingRelics = db.prepare('SELECT x, y FROM relics WHERE world_id = ?').all(worldId);
  for (const r of existingRelics) occupiedCells.add(`${r.x},${r.y}`);

  const civs = db.prepare('SELECT id, capital_x, capital_y FROM civilizations WHERE world_id = ?').all(worldId);
  const relicsToPlace = 10;
  let placed = 0;
  const attemptsPerRelic = 50;

  for (let i = 0; i < relicsToPlace; i++) {
    let placedThis = false;
    for (let attempt = 0; attempt < attemptsPerRelic; attempt++) {
      const civ = civs[Math.floor(Math.random() * civs.length)];
      const radius = 5 + Math.floor(Math.random() * 8); // 5-12 inclus
      const angle = Math.random() * 2 * Math.PI;
      const x = civ.capital_x + Math.round(radius * Math.cos(angle));
      const y = civ.capital_y + Math.round(radius * Math.sin(angle));
      // Vérifier que la cellule est dans la carte et n'est pas occupée
      if (x < 0 || x >= 256 || y < 0 || y >= 192) continue;
      const key = `${x},${y}`;
      if (occupiedCells.has(key)) continue;
      // Vérifier que la cellule est un biome terrestre (optionnel)
      const biome = cells.find(c => c.x === x && c.y === y);
      if (!biome) continue;
      if (biome.biome_type.includes('ocean') || biome.biome_type.includes('deep')) continue;
      
      // Choisir une relique aléatoire dans le pool
      const relicData = relicsPool[Math.floor(Math.random() * relicsPool.length)];
      db.prepare(
        `INSERT INTO relics (world_id, name, description, type, domain, x, y, discovered_by, discovered_at_tick, taken, used)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0)`
      ).run(worldId, relicData.name, relicData.description, relicData.type, relicData.domain, x, y);
      
      occupiedCells.add(key);
      placed++;
      placedThis = true;
      break;
    }
    if (!placedThis) {
      console.warn(`Impossible de placer la relique ${i+1} après ${attemptsPerRelic} tentatives`);
    }
  }
  console.log(`✓ ${placed} reliques placées sur la carte`);

  // Spawn de 20 groupes animaux aléatoires autour des civs
  const animalGroupsToPlace = 20;
  let placedAnimals = 0;
  const attemptsPerAnimal = 30;

  for (let i = 0; i < animalGroupsToPlace; i++) {
    let placedThis = false;
    for (let attempt = 0; attempt < attemptsPerAnimal; attempt++) {
      const civ = civs[Math.floor(Math.random() * civs.length)];
      const radius = 8 + Math.floor(Math.random() * 13); // 8-20 inclus
      const angle = Math.random() * 2 * Math.PI;
      const x = civ.capital_x + Math.round(radius * Math.cos(angle));
      const y = civ.capital_y + Math.round(radius * Math.sin(angle));
      // Vérifier que la cellule est dans la carte et n'est pas occupée
      if (x < 0 || x >= 256 || y < 0 || y >= 192) continue;
      const key = `${x},${y}`;
      if (occupiedCells.has(key)) continue;
      // Vérifier que la cellule est un biome terrestre
      const biome = cells.find(c => c.x === x && c.y === y);
      if (!biome) continue;
      if (biome.biome_type.includes('ocean') || biome.biome_type.includes('deep')) continue;

      // Choisir une espèce aléatoire dans le pool
      const animalData = animalsPool[Math.floor(Math.random() * animalsPool.length)];
      const size = animalData.size_min + Math.floor(Math.random() * (animalData.size_max - animalData.size_min + 1));
      
      db.prepare(
        `INSERT INTO animal_groups (world_id, nom, species, type, size, x, y, respawn_x, respawn_y, dangerosite, is_migratory, migration_direction, discovered_by, last_attack_tick)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        worldId,
        animalData.nom,
        animalData.species,
        animalData.type,
        size,
        x, y,
        x, y, // respawn position = position initiale
        animalData.dangerosite,
        animalData.is_migratory,
        animalData.is_migratory ? (Math.random() > 0.5 ? 'nord' : 'sud') : null,
        '[]',
        0
      );

      occupiedCells.add(key);
      placedAnimals++;
      placedThis = true;
      break;
    }
    if (!placedThis) {
      console.warn(`Impossible de placer le groupe animal ${i+1} après ${attemptsPerAnimal} tentatives`);
    }
  }
  console.log(`✓ ${placedAnimals} groupes animaux placés sur la carte`);

  return worldId;
}

if (require.main === module) {
  seed();
  console.log('\n✓ Seed WorldIA Civilisations terminé');
}

module.exports = { seed };
