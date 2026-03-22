// Système de moral composite basé sur les valeurs de la civilisation

const parseJ = (v, fb) => { try { return JSON.parse(v != null ? v : JSON.stringify(fb)); } catch { return fb; } };

function normalizeBuildings(raw) {
  const arr = parseJ(raw, []);
  return Array.isArray(arr) ? arr.map(b =>
    typeof b === 'string' ? { name: b, category: 'autre', workers: 0, status: 'active' }
                          : { ...b, workers: b.workers || 0 }
  ) : [];
}

// ─── Conditions de satisfaction/frustration par valeur ────────────────────────
const VALUE_SATISFACTION = {

  expansion: {
    satisfied:    (c) => c.territory_count > Math.floor((c.population || 0) / 10) && c.territory_count > 20,
    frustrated:   (c) => (c.population || 0) / Math.max(1, c.territory_count || 1) > 30,
    satisfiedText:  "Ton territoire s'étend régulièrement",
    frustratedText: "Ton peuple étouffe sur un territoire trop petit",
    moralBonus: +8, moralMalus: -12,
  },

  commerce: {
    satisfied:    (c) => (c.active_trade_routes || 0) > 0,
    frustrated:   (c) => (c._known_count || 0) > 0 && (c.active_trade_routes || 0) === 0,
    satisfiedText:  "Tes marchands prospèrent sur les routes commerciales",
    frustratedText: "Tes marchands n'ont aucune route commerciale malgré des voisins connus",
    moralBonus: +8, moralMalus: -12,
  },

  connaissance: {
    satisfied:    (c) => !['primitif'].includes(c.age_tech) || (c._buildings || []).some(s => s.category === 'savoir'),
    frustrated:   (c) => c.age_tech === 'primitif' && !(c._buildings || []).some(s => s.category === 'savoir'),
    satisfiedText:  "Tes savants progressent vers de nouvelles découvertes",
    frustratedText: "Tes savants stagnent, aucune avancée depuis longtemps",
    moralBonus: +8, moralMalus: -12,
  },

  guerre: {
    satisfied:    (c, tick) => (c.last_combat_tick || 0) > 0 && tick - (c.last_combat_tick || 0) < 20,
    frustrated:   (c, tick) => (c.last_combat_tick || 0) === 0 && (c._known_count || 0) > 0,
    satisfiedText:  "Ton armée a prouvé sa valeur au combat",
    frustratedText: "Ton peuple guerrier n'a jamais connu le combat alors que des voisins existent",
    moralBonus: +8, moralMalus: -12,
  },

  spiritualite: {
    satisfied:    (c) => (c._buildings || []).some(s => s.category === 'religieux'),
    frustrated:   (c) => !(c._buildings || []).some(s => s.category === 'religieux') && (c.population || 0) > 200,
    satisfiedText:  "Les temples guident l'âme de ton peuple",
    frustratedText: "Ton peuple n'a aucun lieu sacré, le doute spirituel s'installe",
    moralBonus: +8, moralMalus: -12,
  },

  isolationnisme: {
    satisfied:    (c) => (c.active_trade_routes || 0) === 0 && (c._known_count || 0) === 0,
    frustrated:   (c) => (c.active_trade_routes || 0) > 0 || (c._known_count || 0) > 2,
    satisfiedText:  "Ton peuple vit en paix, à l'écart du monde extérieur",
    frustratedText: "Trop d'étrangers s'immiscent dans tes affaires, ton peuple gronde",
    moralBonus: +8, moralMalus: -12,
  },

  liberte: {
    satisfied:    (c) => c.gouvernement !== 'dictature_militaire',
    frustrated:   (c) => c.gouvernement === 'dictature_militaire',
    satisfiedText:  "Ton peuple est libre et fier de l'être",
    frustratedText: "La dictature pèse sur les libertés, le peuple s'indigne",
    moralBonus: +8, moralMalus: -12,
  },

  ordre: {
    satisfied:    (c) => (c.army_soldiers || 0) > 0 && (c._labor_ratio || 0) > 0.5,
    frustrated:   (c) => (c._labor_ratio || 0) < 0.3,
    satisfiedText:  "L'ordre règne, chaque citoyen a sa place et son rôle",
    frustratedText: "Le désordre gagne, trop de gens sont inoccupés",
    moralBonus: +8, moralMalus: -12,
  },

  survie: {
    satisfied:    (c) => (c._food || 0) > (c.population || 0) * 5,
    frustrated:   (c) => (c._food || 0) < (c.population || 0) * 2,
    satisfiedText:  "Les réserves assurent la survie de ton peuple pour longtemps",
    frustratedText: "Les réserves s'amenuisent dangereusement, la survie est menacée",
    moralBonus: +8, moralMalus: -15,
  },

  exploration: {
    satisfied:    (c, tick) => (c.last_exploration_tick || 0) > 0 && tick - (c.last_exploration_tick || 0) < 10,
    frustrated:   (c, tick) => tick - (c.last_exploration_tick || 0) > 20,
    satisfiedText:  "Tes explorateurs repoussent les frontières de l'inconnu",
    frustratedText: "L'inconnu t'entoure mais personne ne part le découvrir",
    moralBonus: +8, moralMalus: -12,
  },

  art: {
    satisfied:    (c) => (c._buildings || []).some(s => /atelier|art|sculpt|musique|th[eé]âtre|peinture|danse/i.test(s.name)),
    frustrated:   (c) => !(c._buildings || []).some(s => /atelier|art|sculpt|musique|th[eé]âtre|peinture|danse/i.test(s.name)) && (c.population || 0) > 300,
    satisfiedText:  "L'art fleurit et ton peuple s'exprime librement",
    frustratedText: "Ton peuple créatif manque de lieux d'expression artistique",
    moralBonus: +8, moralMalus: -10,
  },

  technologie: {
    satisfied:    (c) => c.age_tech !== 'primitif' && (c._buildings || []).some(s => s.category === 'production'),
    frustrated:   (c) => c.age_tech === 'primitif',
    satisfiedText:  "Tes ingénieurs innovent et repoussent les limites du possible",
    frustratedText: "Le progrès technique est au point mort depuis trop longtemps",
    moralBonus: +8, moralMalus: -12,
  },
};

/**
 * Calcule le moral composite à partir de l'état de la civ + tick courant.
 * Retourne { moral, frustrations, satisfactions, moralLabel }
 */
function calculateMoral(civ, currentTick = 0) {
  const buildings  = normalizeBuildings(civ.buildings);
  const resources  = parseJ(civ.resources, {});
  const valeurs    = parseJ(civ.valeurs, []);
  const foodStock  = resources.nourriture || 0;

  // Calcul taux d'occupation (travailleurs actifs / main-d'œuvre totale)
  const activeWorkers = buildings.reduce((s, b) => s + (b.workers || 0), 0);
  const totalLabor    = Math.floor((civ.population || 0) * 0.6);
  const laborRatio    = totalLabor > 0 ? activeWorkers / totalLabor : 0;

  // Contexte enrichi pour les checks
  const ext = {
    ...civ,
    _buildings:    buildings,
    _food:         foodStock,
    _known_count:  parseJ(civ.discovered_civ_ids, []).length,
    _labor_ratio:  laborRatio,
  };

  let moral = 60; // base neutre

  // ── Nourriture ──
  if (foodStock <= 0)                           moral -= 30;
  else if (foodStock > (civ.population || 0) * 5) moral += 10;

  // ── Valeurs ──
  const frustrations  = [];
  const satisfactions = [];

  for (const valeur of valeurs) {
    const check = VALUE_SATISFACTION[valeur];
    if (!check) continue;

    if (check.satisfied(ext, currentTick)) {
      moral += check.moralBonus;
      satisfactions.push(check.satisfiedText);
    } else if (check.frustrated(ext, currentTick)) {
      moral += check.moralMalus;
      frustrations.push(check.frustratedText);
    }
  }

  // ── Densité ──
  const density = (civ.population || 0) / Math.max(1, civ.territory_count || 1);
  if (density > 40) moral -= 10;
  if (density > 60) moral -= 10;

  // ── Menace diplomatique ──
  const knownIdsCount = parseJ(civ.discovered_civ_ids, []).length;
  if (knownIdsCount > 0) {
    // Vérifier s'il y a une guerre déclarée dans diplomacy (approximation via DB non disponible ici)
    // Cette vérification sera faite dans civEngine.js si besoin
  }

  moral = Math.max(0, Math.min(100, Math.round(moral)));

  const moralLabel = moral >= 80 ? 'excellent'
    : moral >= 60 ? 'bon'
    : moral >= 40 ? 'neutre'
    : moral >= 20 ? 'bas'
    : 'catastrophique';

  return { moral, frustrations, satisfactions, moralLabel };
}

/**
 * Vérifie la cohérence des travailleurs et recalcule free_workforce.
 * Retourne le nombre de travailleurs libres.
 */
function checkWorkerConsistency(civ, processesWorkers = 0) {
  const buildings    = normalizeBuildings(civ.buildings);
  const structWorkers = buildings.reduce((s, b) => s + (b.workers || 0), 0);
  const army         = civ.army_soldiers || 0;
  const totalLabor   = Math.floor((civ.population || 0) * 0.6);
  const freeLabor    = Math.max(0, totalLabor - structWorkers - processesWorkers - army);
  return freeLabor;
}

module.exports = { calculateMoral, checkWorkerConsistency, VALUE_SATISFACTION };
