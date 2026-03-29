// Système d'information et d'interactions entre civilisations

const { db } = require('../config/db');
const { addMemoryEntry } = require('./civActionResolver');

const parseJ = (v, fb) => { try { return JSON.parse(v != null ? v : JSON.stringify(fb)); } catch { return fb; } };

function getCurrentYear(tick) {
  return Math.floor((tick - 1) / 12) + 1;
}

// ─── Gestion du knowledge_about ──────────────────────────────────────────────

function getKnowledge(civ) {
  return parseJ(civ.knowledge_about, {});
}

function saveKnowledge(civId, knowledge) {
  db.prepare('UPDATE civilizations SET knowledge_about=? WHERE id=?')
    .run(JSON.stringify(knowledge), civId);
}

/**
 * Vérifie si deux territoires se touchent (cas frontalier).
 * Retourne le nombre de cases de frontière commune.
 */
function countSharedBorder(civAId, civBId, worldId) {
  const result = db.prepare(`
    SELECT COUNT(*) as n FROM territories a
    JOIN territories b ON b.world_id=a.world_id
      AND ABS(a.x-b.x) + ABS(a.y-b.y) = 1
    WHERE a.civ_id=? AND b.civ_id=? AND a.world_id=?
  `).get(civAId, civBId, worldId);
  return result?.n || 0;
}

/**
 * Génère une observation initiale d'une civ (ce qu'on voit à distance).
 */
function generateInitialObservation(targetCiv) {
  const age = targetCiv.age_tech || 'primitif';
  const soldiers = targetCiv.army_soldiers || 0;
  const pop = targetCiv.population || 0;

  const obs = [];
  if (soldiers > 50)  obs.push(`Une présence militaire significative est visible`);
  if (age === 'bronze' || age === 'fer') obs.push(`Portent des armes en ${age}`);
  if (pop > 500)       obs.push(`Nombreux feux de campement, population dense`);
  else if (pop < 100)  obs.push(`Petit établissement, peu de monde visible`);

  return obs.length ? obs[0] : `Présence humaine repérée à la frontière`;
}

/**
 * Met à jour les connaissances d'une civ lors d'un contact frontalier.
 * Appelé depuis civEngine lors du scan de voisins.
 */
function checkFrontierContact(civA, civB, worldId, currentTick) {
  const border = countSharedBorder(civA.id, civB.id, worldId);
  if (border === 0) return false;

  const knowledge = getKnowledge(civA);
  const key = String(civB.id);

  if (!knowledge[key]) {
    // Première découverte → ajouter entrée
    knowledge[key] = {
      nom: civB.nom,
      discoveredAt: currentTick,
      source: 'frontier_contact',
      frontierLength: border,
      observations: [{ tick: currentTick, text: generateInitialObservation(civB) }],
      spyReports: [],
      tradeReports: [],
      diplomacyReports: [],
      lastKnownArmy: civB.army_soldiers || 0,
    };
    saveKnowledge(civA.id, knowledge);
    return true; // nouvelle découverte
  } else {
    // Mise à jour frontière
    knowledge[key].frontierLength = border;
    saveKnowledge(civA.id, knowledge);
    return false;
  }
}

/**
 * Résout la fin d'un processus d'espionnage.
 */
function resolveSpying(civ, targetCivId, allCivs, currentTick) {
  const targetCiv = allCivs.find(c => c.id === targetCivId || String(c.id) === String(targetCivId));
  if (!targetCiv) return { success: false, message: 'Cible introuvable' };

  const year = getCurrentYear(currentTick);
  const targetName = targetCiv.nom;

  // Risque de capture : 20%
  if (Math.random() < 0.2) {
    addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Espionnage de ${targetName} : échec`);
    return {
      success: false,
      captured: true,
      message: `Tes espions envoyés chez ${targetCiv.nom} ont été capturés !`,
      targetMessage: `Des espions de ${civ.nom} ont été capturés sur ton territoire.`,
    };
  }

  // Rapport approximatif (±30%)
  const pop = targetCiv.population || 0;
  const popEst = Math.round(pop * (0.7 + Math.random() * 0.6) / 100) * 100;
  const armyStr = (targetCiv.army_soldiers || 0) > 0 ? 'armée visible' : "pas d'armée visible";
  const report  = `Pop. estimée : ~${popEst}. ${armyStr}. Âge tech : ${targetCiv.age_tech}. Fiabilité : moyenne.`;

  const knowledge = getKnowledge(civ);
  const key = String(targetCiv.id);
  if (!knowledge[key]) {
    knowledge[key] = {
      nom: targetCiv.nom, discoveredAt: currentTick, source: 'espionnage',
      frontierLength: 0, observations: [], spyReports: [], tradeReports: [], diplomacyReports: [],
    };
  }
  knowledge[key].spyReports.push({ tick: currentTick, text: report });
  saveKnowledge(civ.id, knowledge);

  addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Espionnage de ${targetName} : réussi`);

  return {
    success: true,
    message: `Tes espions sont revenus de ${targetCiv.nom} avec un rapport.`,
    report,
  };
}

/**
 * Résout la fin d'une expédition commerciale.
 */
function resolveTradeExpedition(civA, targetCivId, allCivs, currentTick) {
  const civB = allCivs.find(c => c.id === targetCivId || String(c.id) === String(targetCivId));
  if (!civB) return { success: false, message: 'Cible introuvable' };

  // Accepte si pas en guerre et pas isolationniste
  const bValeurs = parseJ(civB.valeurs, []);
  const dipRow = db.prepare(
    "SELECT relation FROM diplomacy WHERE world_id=? AND ((civ_a_id=? AND civ_b_id=?) OR (civ_a_id=? AND civ_b_id=?))"
  ).get(civB.world_id || civA.world_id, civA.id, civB.id, civB.id, civA.id);
  const atWar = dipRow?.relation === 'guerre';

  if (atWar || bValeurs.includes('isolationnisme')) {
    return { success: false, message: `Tes marchands ont été refoulés par ${civB.nom}.` };
  }

  // Échange simple : nourriture contre bois/pierre
  const resA = parseJ(civA.resources, {});
  const resB = parseJ(civB.resources, {});
  const foodGiven = Math.min(resA.nourriture || 0, 50);
  const boisGained = Math.min(resB.bois || 0, 30);

  if (foodGiven > 0 && boisGained > 0) {
    // Appliquer l'échange
    resA.nourriture = (resA.nourriture || 0) - foodGiven;
    resA.bois = (resA.bois || 0) + boisGained;
    db.prepare('UPDATE civilizations SET resources=?, active_trade_routes=active_trade_routes+1 WHERE id=?')
      .run(JSON.stringify(resA), civA.id);

    resB.nourriture = (resB.nourriture || 0) + foodGiven;
    resB.bois = (resB.bois || 0) - boisGained;
    db.prepare('UPDATE civilizations SET resources=? WHERE id=?').run(JSON.stringify(resB), civB.id);

    const report = `Échange avec ${civB.nom} : donné ${foodGiven} nourriture, reçu ${boisGained} bois.`;
    const knowledge = getKnowledge(civA);
    const key = String(civB.id);
    if (!knowledge[key]) {
      knowledge[key] = {
        nom: civB.nom, discoveredAt: currentTick, source: 'commerce',
        frontierLength: 0, observations: [], spyReports: [], tradeReports: [], diplomacyReports: [],
      };
    }
    knowledge[key].tradeReports.push({ tick: currentTick, text: report });
    saveKnowledge(civA.id, knowledge);

    return { success: true, message: report };
  }

  return { success: false, message: `Commerce avec ${civB.nom} : échange impossible (ressources insuffisantes).` };
}

/**
 * Construit le bloc VOISINS CONNUS pour le prompt LLM.
 * Utilise knowledge_about + discovered_civ_ids.
 */
function buildNeighborInfo(civ, allCivs) {
  const knowledge = getKnowledge(civ);
  const discovered = new Set(parseJ(civ.discovered_civ_ids, []));

  if (Object.keys(knowledge).length === 0 && discovered.size === 0) {
    return 'Aucun. Territoire inexploré dans toutes les directions.';
  }

  const lines = [];

  for (const [id, info] of Object.entries(knowledge)) {
    const targetCiv = allCivs.find(c => c.id === parseInt(id) || c.id === id);
    if (!targetCiv || targetCiv.status !== 'alive') continue;

    lines.push(`▸ ${info.nom || targetCiv.nom} (découvert tick ${info.discoveredAt}, frontière: ${info.frontierLength} cases)`);

    // Observations récentes (3 max)
    const recentObs = (info.observations || []).slice(-3);
    for (const obs of recentObs) {
      lines.push(`  - Observation (tick ${obs.tick}): ${obs.text}`);
    }
    // Rapports espions (2 max)
    for (const spy of (info.spyReports || []).slice(-2)) {
      lines.push(`  - Espion (tick ${spy.tick}): ${spy.text}`);
    }
    // Commerce (2 max)
    for (const trade of (info.tradeReports || []).slice(-2)) {
      lines.push(`  - Commerce (tick ${trade.tick}): ${trade.text}`);
    }
    if (recentObs.length === 0 && (info.spyReports || []).length === 0 && (info.tradeReports || []).length === 0) {
      lines.push(`  - [Aucune information détaillée — contact frontalier uniquement]`);
    }
  }

  // Civs découvertes sans knowledge détaillé
  for (const id of discovered) {
    if (knowledge[String(id)]) continue; // déjà dans knowledge
    const targetCiv = allCivs.find(c => c.id === id && c.status === 'alive');
    if (!targetCiv) continue;
    lines.push(`▸ ${targetCiv.nom} (aperçu, aucune info détaillée)`);
  }

  return lines.length ? lines.join('\n') : 'Aucun voisin connu.';
}

/**
 * Calcul du gain de territoire selon le nombre d'explorateurs.
 */
function calculateExplorationGain(numExplorers) {
  if (numExplorers <= 10) return 5;
  if (numExplorers <= 30) return 5 + Math.floor((numExplorers - 10) * 0.5);
  if (numExplorers <= 100) return 15 + Math.floor((numExplorers - 30) * 0.3);
  return 36 + Math.floor((numExplorers - 100) * 0.1);
}

module.exports = {
  checkFrontierContact,
  resolveSpying,
  resolveTradeExpedition,
  buildNeighborInfo,
  calculateExplorationGain,
  getKnowledge,
};
