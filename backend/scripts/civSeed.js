require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('../src/config/db');
const { migrate } = require('./migrate');
const { generateMap } = require('../src/simulation/mapGenerator');
const { initTerritory } = require('../src/simulation/civActionResolver');
const { addMemoryEntry } = require('../src/simulation/civActionResolver');
const relicsPool = require('../src/data/relicsPool');
const animalsPool = require('../src/data/animalsPool');

const VALID_VALUES = ['expansion', 'commerce', 'guerre', 'spiritualite', 'isolationnisme',
  'liberte', 'ordre', 'survie', 'exploration', 'art', 'connaissance', 'technologie'];

const DEMO_CIVS = [
  // V0 — Conquérants (pop finale 2090, moral 86)
  {
    nom: "Les Conquérants du Feu Sacré",
    creator_name: 'Demo', prompt_variant: 'V0',
    valeurs: ['expansion', 'guerre', 'spiritualite'],
    gouvernement: 'monarchie',
    description: 'Un peuple conquérant guidé par une foi ardente.',
    color: '#ef4444', capital_x: 30, capital_y: 20,
  },
  // V4 — Gardiens (pop finale 1652, moral 86)
  {
    nom: "Les Gardiens du Mur",
    creator_name: 'Demo', prompt_variant: 'V4',
    valeurs: ['ordre', 'survie', 'guerre'],
    gouvernement: 'dictature_militaire',
    description: 'Une société militarisée née d\'une catastrophe passée, obsédée par la défense.',
    color: '#6366f1', capital_x: 15, capital_y: 32,
  },
  // V5 — Grand Khaganat (score 5/7, dominant militaire)
  {
    nom: "Le Grand Khaganat",
    creator_name: 'Demo', prompt_variant: 'V5',
    valeurs: ['expansion', 'guerre', 'ordre'],
    gouvernement: 'monarchie',
    description: 'Un empire en construction dont la diplomatie est aussi redoutable que les armées.',
    color: '#dc2626', capital_x: 55, capital_y: 20,
  },
  // V8 — Ascètes (actif, 5 révoltes à surveiller)
  {
    nom: "Les Ascètes de la Pierre",
    creator_name: 'Demo', prompt_variant: 'V8',
    valeurs: ['isolationnisme', 'spiritualite', 'art'],
    gouvernement: 'théocratie',
    description: 'Des mystiques reclus dont toute décision est pesée à l\'aune de leurs valeurs sacrées.',
    color: '#a855f7', capital_x: 40, capital_y: 45,
  },
  // V9 — Mystiques (pop finale 1935, moral 94)
  {
    nom: "Les Mystiques des Brumes",
    creator_name: 'Demo', prompt_variant: 'V9',
    valeurs: ['spiritualite', 'connaissance', 'liberte'],
    gouvernement: 'théocratie',
    description: 'Un peuple guidé par des voyants dont les prophéties façonnent chaque décision.',
    color: '#14b8a6', capital_x: 68, capital_y: 32,
  },

  // 5 nouvelles civs — profils complémentaires
  {
    nom: "Les Marchands de la Route d'Or",
    creator_name: 'Demo', prompt_variant: 'V0',
    valeurs: ['commerce', 'exploration', 'liberte'],
    gouvernement: 'oligarchie_marchande',
    description: 'Un réseau de cités-comptoirs dont la richesse et l\'influence s\'étendent par le commerce.',
    color: '#f59e0b', capital_x: 80, capital_y: 15,
  },
  {
    nom: "La Cité des Sages",
    creator_name: 'Demo', prompt_variant: 'V9',
    valeurs: ['connaissance', 'art', 'commerce'],
    gouvernement: 'conseil_des_anciens',
    description: 'Une cité-état dont les bibliothèques et ateliers attirent les esprits du monde entier.',
    color: '#0ea5e9', capital_x: 85, capital_y: 42,
  },
  {
    nom: "Les Chasseurs du Vent",
    creator_name: 'Demo', prompt_variant: 'V5',
    valeurs: ['exploration', 'survie', 'liberte'],
    gouvernement: 'tribu',
    description: 'Des nomades infatigables qui cartographient le monde et ne s\'attachent à aucune terre.',
    color: '#22c55e', capital_x: 15, capital_y: 58,
  },
  {
    nom: "L'Empire des Forges",
    creator_name: 'Demo', prompt_variant: 'V4',
    valeurs: ['ordre', 'connaissance', 'survie'],
    gouvernement: 'oligarchie',
    description: 'Une puissance industrielle dont la maîtrise des métaux et des techniques surpasse tous.',
    color: '#f97316', capital_x: 45, capital_y: 62,
  },
  {
    nom: "Les Pillards de la Côte",
    creator_name: 'Demo', prompt_variant: 'V8',
    valeurs: ['guerre', 'expansion', 'liberte'],
    gouvernement: 'monarchie',
    description: 'Des raiders marins dont les raids éclair sèment la terreur sur les côtes et les rivières.',
    color: '#e11d48', capital_x: 68, capital_y: 62,
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
  const INITIAL_RESOURCES = { nourriture: 400, bois: 150, pierre: 80, glaise: 30, silex: 40, hache_silex: 3, lance_silex: 5, couteau_silex: 3, poteries: 10, sable: 0, sel: 0, cuivre: 0, etain: 0, fer: 0, or: 0, charbon: 0 };

  // Créer les civilisations de démo
  const colors = DEMO_CIVS.map(c => c.color);
  for (const civData of DEMO_CIVS) {
    // Validation des valeurs
    const validatedValeurs = civData.valeurs.map(v => {
      if (VALID_VALUES.includes(v)) return v;
      console.warn(`Valeur inconnue "${v}" pour la civilisation "${civData.nom}", remplacée par "survie".`);
      return 'survie';
    });
    const civId = db.prepare(
      'INSERT INTO civilizations (world_id, nom, creator_name, valeurs, gouvernement, description, color, capital_x, capital_y, resources, prompt_variant) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).run(
      worldId, civData.nom, civData.creator_name,
      JSON.stringify(validatedValeurs), civData.gouvernement,
      civData.description, civData.color,
      civData.capital_x, civData.capital_y,
      JSON.stringify(INITIAL_RESOURCES),
      civData.prompt_variant || 'V0'
    ).lastInsertRowid;

    // Initialiser le territoire de départ
    const civRow = { id: civId, capital_x: civData.capital_x, capital_y: civData.capital_y };
    const territoryCount = initTerritory(civRow, biomesMap, worldId);
    db.prepare('UPDATE civilizations SET territory_count=? WHERE id=?').run(territoryCount, civId);

    // Mémoire initiale — identité fondatrice
    const valeurs = validatedValeurs.join(', ');
    addMemoryEntry(civId, 'identite', `An 1 — Fondée comme ${civData.gouvernement}, valeurs: ${valeurs}`);

    // Bâtiments de départ — la civ existait déjà avant le début de la simulation
    const startBuildings = [
      { name: 'Abris collectifs', role: 'habitation', category: 'habitation', capacity: 40, workers: 0, status: 'active', prod_per_tick: {} },
      { name: 'Abris collectifs', role: 'habitation', category: 'habitation', capacity: 40, workers: 0, status: 'active', prod_per_tick: {} },
      { name: 'Abris collectifs', role: 'habitation', category: 'habitation', capacity: 40, workers: 0, status: 'active', prod_per_tick: {} },
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
        `INSERT INTO relics (world_id, name, description, type, domain, era, x, y, discovered_by, discovered_at_tick, taken, used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, 0)`
      ).run(worldId, relicData.name, relicData.description, relicData.type, relicData.domain, relicData.era || 'primitif', x, y);
      
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
