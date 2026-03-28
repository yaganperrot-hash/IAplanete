const db = require('../src/config/db').db;
const animalsPool = require('../src/data/animalsPool');

function spawnAnimalGroups(worldId, civs) {
  if (!civs || civs.length === 0) {
    console.log('Aucune civilisation, pas de spawn animal');
    return;
  }
  console.log(`Spawning animal groups for world ${worldId} with ${civs.length} civs`);
  const stmt = db.prepare(`
    INSERT INTO animal_groups (
      world_id, nom, species, type, size, x, y,
      respawn_x, respawn_y, dangerosite, is_migratory,
      migration_direction, discovered_by, last_attack_tick
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let spawned = 0;
  for (let i = 0; i < 20; i++) {
    const civ = civs[Math.floor(Math.random() * civs.length)];
    const animal = animalsPool[Math.floor(Math.random() * animalsPool.length)];
    const size = Math.floor(Math.random() * (animal.size_max - animal.size_min + 1)) + animal.size_min;
    // Position aléatoire dans un rayon de 8-20 cases autour de la capitale
    const radius = 8 + Math.floor(Math.random() * 13);
    const angle = Math.random() * Math.PI * 2;
    const x = civ.capital_x + Math.round(Math.cos(angle) * radius);
    const y = civ.capital_y + Math.round(Math.sin(angle) * radius);
    // Vérifier que la case est valide (dans la carte)
    if (x < 0 || x >= 256 || y < 0 || y >= 192) continue;
    stmt.run(
      worldId,
      animal.nom,
      animal.species,
      animal.type,
      size,
      x, y,
      x, y, // respawn same as initial
      animal.dangerosite,
      animal.is_migratory,
      animal.is_migratory === 1 ? (Math.random() > 0.5 ? 'nord' : 'sud') : null,
      '[]', // discovered_by vide
      0
    );
    spawned++;
  }
  console.log(`✅ ${spawned} groupes animaux spawnés`);
}

// Main
const world = db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
if (!world) {
  console.error('Monde civilisations non trouvé');
  process.exit(1);
}
const civs = db.prepare("SELECT id, capital_x, capital_y FROM civilizations WHERE world_id=? AND status='alive'").all(world.id);
spawnAnimalGroups(world.id, civs);
console.log('Terminé.');