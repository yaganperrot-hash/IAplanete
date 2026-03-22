/**
 * Spéciation : si une sous-population d'une espèce est géographiquement isolée
 * depuis assez longtemps, elle peut devenir une nouvelle espèce.
 *
 * Détection simple : centroïde par cluster de créatures.
 * Si deux clusters sont séparés par > 30 cases ET la population est >= 20,
 * on crée une nouvelle espèce fille avec des stats légèrement mutées.
 */

const { db } = require('../config/db');
const parseJ = (v, fb = {}) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

const SPECIATION_MIN_POP = 20;       // Population minimale pour se spécier
const SPECIATION_MIN_DIST = 35;      // Distance minimale entre clusters
const SPECIATION_TICK_COOLDOWN = 50; // Ticks minimum entre deux spéciations de la même espèce

// Dernière spéciation par espèce { speciesId: tick }
const lastSpeciationTick = {};

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function centroid(creatures) {
  if (!creatures.length) return { x: 0, y: 0 };
  const sx = creatures.reduce((s, c) => s + c.x, 0);
  const sy = creatures.reduce((s, c) => s + c.y, 0);
  return { x: sx / creatures.length, y: sy / creatures.length };
}

// Sépare les créatures en 2 clusters via k-means simplifié (1 itération)
function splitInTwo(creatures) {
  if (creatures.length < 4) return null;

  // Choisir deux créatures les plus éloignées comme germes
  let maxDist = 0, seedA = creatures[0], seedB = creatures[1];
  for (let i = 0; i < Math.min(creatures.length, 20); i++) {
    for (let j = i + 1; j < Math.min(creatures.length, 20); j++) {
      const d = distance(creatures[i], creatures[j]);
      if (d > maxDist) { maxDist = d; seedA = creatures[i]; seedB = creatures[j]; }
    }
  }

  if (maxDist < SPECIATION_MIN_DIST) return null; // Pas assez séparés

  // Assigner chaque créature au cluster le plus proche
  const clusterA = [], clusterB = [];
  for (const c of creatures) {
    const da = distance(c, seedA);
    const db = distance(c, seedB);
    (da <= db ? clusterA : clusterB).push(c);
  }

  if (clusterA.length < 5 || clusterB.length < 5) return null;

  const cA = centroid(clusterA);
  const cB = centroid(clusterB);
  if (distance(cA, cB) < SPECIATION_MIN_DIST) return null;

  return { clusterA, clusterB };
}

// Muter légèrement les stats (+/- 10%)
function mutateStats(stats) {
  const mutated = {};
  for (const [k, v] of Object.entries(stats)) {
    const factor = 0.9 + Math.random() * 0.2; // 0.9 – 1.1
    mutated[k] = Math.max(1, Math.round(v * factor));
  }
  return mutated;
}

// Générer un nom de sous-espèce
function generateSubspeciesName(parentName, idx) {
  const suffixes = ['var. Alpha', 'var. Beta', 'var. Gamma', 'var. Delta', 'var. Omega'];
  return `${parentName} ${suffixes[idx % suffixes.length]}`;
}

// Couleur dérivée (légèrement différente)
function deriveColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const shift = Math.floor(Math.random() * 60) - 30;
  const nr = Math.min(255, Math.max(0, r + shift));
  const ng = Math.min(255, Math.max(0, g - shift));
  const nb = Math.min(255, Math.max(0, b + (shift > 0 ? -shift : shift)));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

/**
 * Vérifier et déclencher une spéciation éventuelle
 * @param {number} worldId
 * @param {number} currentTick
 * @returns {Array} nouveaux événements
 */
function checkSpeciation(worldId, currentTick) {
  const newEvents = [];

  const aliveSpecies = db.prepare(
    "SELECT * FROM species WHERE world_id=? AND status='alive'"
  ).all(worldId).map(s => ({ ...s, params: parseJ(s.params), stats: parseJ(s.stats) }));

  for (const sp of aliveSpecies) {
    // Cooldown
    const lastTick = lastSpeciationTick[sp.id] || 0;
    if (currentTick - lastTick < SPECIATION_TICK_COOLDOWN) continue;

    // Récupérer les créatures vivantes
    const creatures = db.prepare(
      "SELECT id, x, y FROM creatures WHERE species_id=? AND status='alive'"
    ).all(sp.id);

    if (creatures.length < SPECIATION_MIN_POP) continue;

    // Essayer de séparer en 2 clusters
    const split = splitInTwo(creatures);
    if (!split) continue;

    const { clusterA, clusterB } = split;

    // Créer la nouvelle espèce (variante de la plus petite population)
    const newCluster = clusterA.length <= clusterB.length ? clusterA : clusterB;
    if (newCluster.length < 5) continue;

    const existingVariants = db.prepare(
      'SELECT COUNT(*) as n FROM species WHERE parent_species_id=?'
    ).get(sp.id)?.n || 0;

    const newName = generateSubspeciesName(sp.nom, existingVariants);
    const newColor = deriveColor(sp.color || '#ffffff');
    const newStats = mutateStats(sp.stats);
    const newParams = { ...sp.params };

    // Insérer la nouvelle espèce
    const result = db.prepare(
      `INSERT INTO species (world_id, nom, creator_name, params, stats, color, status, population, description, parent_species_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(
      worldId, newName, `Spéciation de ${sp.creator_name}`,
      JSON.stringify(newParams), JSON.stringify(newStats),
      newColor, 'alive', newCluster.length,
      `Sous-espèce issue de ${sp.nom} par isolement géographique.`,
      sp.id
    );
    const newSpId = result.lastInsertRowid;

    // Réassigner les créatures du nouveau cluster à la nouvelle espèce
    const idList = newCluster.map(c => c.id);
    for (const cid of idList) {
      db.prepare('UPDATE creatures SET species_id=? WHERE id=?').run(newSpId, cid);
    }

    // Mettre à jour la population de l'espèce parente
    db.prepare('UPDATE species SET population=population-? WHERE id=?').run(newCluster.length, sp.id);

    lastSpeciationTick[sp.id] = currentTick;
    lastSpeciationTick[newSpId] = currentTick;

    newEvents.push({
      type: 'speciation',
      description: `${sp.nom} s'est scindée ! Une nouvelle espèce est née : ${newName} (${newCluster.length} individus isolés).`,
      species_ids: [sp.id, newSpId],
      x: Math.round(centroid(newCluster).x),
      y: Math.round(centroid(newCluster).y),
    });

    console.log(`🧬 Spéciation : ${sp.nom} → ${newName} (${newCluster.length} individus)`);
  }

  return newEvents;
}

module.exports = { checkSpeciation };
