require('dotenv').config();
const { db } = require('../config/db');
const { MAP_WIDTH, MAP_HEIGHT } = require('./mapGenerator');
const { migrate } = require('../../scripts/migrate');
const civLLM = require('../llm/civOllamaLLM');
const {
  resolveEffect, parseEffets, advanceProcesses, buildCivContext,
  initTerritory, discoverAdjacentCivs, discoverRelicsInTerritory, addMemoryEntry, updateResources, getMilitaryPower,
  normalizeBuildings, calculateProduction, expandTerritory, calculateHoused,
} = require('./civActionResolver');
const { calculateMoral, checkWorkerConsistency } = require('./moralSystem');
const { checkFrontierContact, resolveSpying, resolveTradeExpedition, buildNeighborInfo } = require('./civInteractions');

const parseJ = (v, fb = []) => { try { return JSON.parse(v || JSON.stringify(fb)); } catch { return fb; } };

// ─── Calendrier mensuel (1 tick = 1 mois) ─────────────────────────────────────
const MONTHS = [
  { name: 'Janvier',   season: 'hiver',     idx: 0 },
  { name: 'Février',   season: 'hiver',     idx: 1 },
  { name: 'Mars',      season: 'printemps', idx: 2 },
  { name: 'Avril',     season: 'printemps', idx: 3 },
  { name: 'Mai',       season: 'printemps', idx: 4 },
  { name: 'Juin',      season: 'ete',       idx: 5 },
  { name: 'Juillet',   season: 'ete',       idx: 6 },
  { name: 'Août',      season: 'ete',       idx: 7 },
  { name: 'Septembre', season: 'automne',   idx: 8 },
  { name: 'Octobre',   season: 'automne',   idx: 9 },
  { name: 'Novembre',  season: 'automne',   idx: 10 },
  { name: 'Décembre',  season: 'hiver',     idx: 11 },
];
function getCurrentMonth(tick) { return MONTHS[((tick - 1) % 12 + 12) % 12]; }
function getCurrentYear(tick)  { return Math.floor((tick - 1) / 12) + 1; }

// ─── Événements aléatoires ────────────────────────────────────────────────────
function rollEvents(civ, season, globalEvents, currentTick) {
  const pop      = civ.population || 0;
  const results  = [];

  // Sécheresse (été, 5%)
  if (season === 'ete' && Math.random() < 0.05) {
    results.push({ msg: 'Une sécheresse frappe tes terres. Les champs brûlent sous le soleil. Presque rien ne pousse ce mois-ci.', type: 'secheresse', agriMod: 0.2 });
    globalEvents.push({ type: 'catastrophe', description: `Sécheresse dans ${civ.nom} ! Récoltes quasi-nulles.`, civ_ids: [civ.id] });
  }

  // Inondation (printemps, 3%)
  if (season === 'printemps' && Math.random() < 0.03) {
    const deaths = Math.ceil(pop * 0.02);
    results.push({ msg: `Les eaux ont monté. ${deaths} personnes ont péri dans les flots.`, type: 'inondation', deaths });
    globalEvents.push({ type: 'catastrophe', description: `Inondation dans ${civ.nom} ! -${deaths} morts.`, civ_ids: [civ.id] });
  }

  // Tempête (automne/hiver, 4%)
  if (['automne', 'hiver'].includes(season) && Math.random() < 0.04) {
    const woodLoss = 50 + Math.floor(Math.random() * 50);
    results.push({ msg: `Une tempête violente a frappé. Du bois a été détruit (-${woodLoss}).`, type: 'tempete', resourceLoss: { bois: woodLoss } });
    globalEvents.push({ type: 'catastrophe', description: `Tempête dans ${civ.nom} ! -${woodLoss} bois.`, civ_ids: [civ.id] });
  }

  // Grand froid (hiver, 6%)
  if (season === 'hiver' && Math.random() < 0.06) {
    results.push({ msg: 'Un froid extrême s\'abat. Le bois brûle deux fois plus vite. Les sans-abri sont en danger de mort.', type: 'grand_froid', extraCold: true });
    globalEvents.push({ type: 'catastrophe', description: `Grand froid dans ${civ.nom} !`, civ_ids: [civ.id] });
  }

  // Incendie (été, 3%)
  if (season === 'ete' && Math.random() < 0.03) {
    const deaths  = Math.floor(Math.random() * 5) + 1;
    const woodLoss = 100;
    results.push({ msg: `Un incendie éclate. ${deaths} morts. -${woodLoss} bois perdus dans les flammes.`, type: 'incendie', deaths, resourceLoss: { bois: woodLoss } });
    globalEvents.push({ type: 'catastrophe', description: `Incendie dans ${civ.nom} !`, civ_ids: [civ.id] });
  }

  // Épidémie (pop > 200, 2%)
  if (pop > 200 && Math.random() < 0.02) {
    const deaths = Math.ceil(pop * 0.03);
    results.push({ msg: `Une maladie se répand dans le village. ${deaths} personnes ont succombé.`, type: 'epidemie', deaths });
    globalEvents.push({ type: 'epidemie', description: `Épidémie dans ${civ.nom} ! -${deaths} morts.`, civ_ids: [civ.id] });
  }

  // Bonne récolte (automne, 8%)
  if (season === 'automne' && Math.random() < 0.08) {
    results.push({ msg: 'Les récoltes sont exceptionnelles ! Les greniers débordent de provisions.', type: 'bonne_recolte', agriBonus: 2.0 });
    globalEvents.push({ type: 'bonus', description: `Récolte exceptionnelle pour ${civ.nom} !`, civ_ids: [civ.id] });
  }

  // Naissances nombreuses (5%)
  if (Math.random() < 0.05) {
    results.push({ msg: 'Beaucoup de naissances ce mois-ci. Le village résonne de cris de nourrissons.', type: 'naissances', birthBonus: 2.0 });
  }

  return results;
}

// ─── Appliquer les événements sur une civ ─────────────────────────────────────
function applyEvents(civ, eventResults, newResources, newPop) {
  let pop = newPop;
  const res = { ...newResources };

  for (const ev of eventResults) {
    if (ev.deaths > 0) pop = Math.max(0, pop - ev.deaths);
    if (ev.resourceLoss) {
      for (const [r, loss] of Object.entries(ev.resourceLoss)) {
        res[r] = Math.max(0, (res[r] || 0) - loss);
      }
    }
  }

  return { pop, res };
}

// ─── Gestion des reliques ──────────────────────────────────────────────────
function processRelicUsage(civId, worldId, currentTick, events) {
  const relics = db.prepare(
    `SELECT id, name, type, domain, bonus_remaining FROM relics
     WHERE world_id=? AND discovered_by=? AND taken=1 AND used=0`
  ).all(worldId, civId);
  for (const relic of relics) {
    // Chance d'utilisation : 2% par tick
    if (Math.random() < 0.02) {
      db.prepare(
        `UPDATE relics SET used=1, bonus_remaining=5 WHERE id=?`
      ).run(relic.id);
      events.push({
        type: 'relique_utilisee',
        description: `Votre peuple a utilisé la relique "${relic.name}" (${relic.type}/${relic.domain}).`,
        civ_ids: [civId]
      });
      // Ajouter à last_consequences de la civ
      const civ = db.prepare('SELECT last_consequences FROM civilizations WHERE id=?').get(civId);
      const lastConsequences = parseJ(civ.last_consequences, []);
      lastConsequences.push({
        type: 'relique_utilisee',
        data: { relicId: relic.id, relicName: relic.name, type: relic.type, domain: relic.domain }
      });
      db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?').run(
        JSON.stringify(lastConsequences), civId
      );
      console.log(`  [RELIQUE] ${civId} utilise ${relic.name}`);
    }
  }
}

function applyRelicBonuses(civId, worldId, resources) {
  const relics = db.prepare(
    `SELECT id, type, domain, bonus_remaining FROM relics
     WHERE world_id=? AND discovered_by=? AND bonus_remaining > 0`
  ).all(worldId, civId);
  let foodMultiplier = 1.0;
  let woodMultiplier = 1.0;
  let militaryBonus = 0;
  let moralBonus = 0;
  for (const relic of relics) {
    // Appliquer les bonus selon type/domaine
    if (relic.type === 'objet' && relic.domain === 'outil') {
      foodMultiplier += 0.10; // +10% nourriture
    } else if (relic.type === 'objet' && relic.domain === 'arme') {
      militaryBonus += 0.05; // +5% puissance militaire
    } else if (relic.type === 'art' && relic.domain === 'art') {
      moralBonus += 5; // +5 moral
    } else if (relic.type === 'construction' && relic.domain === 'ruines') {
      woodMultiplier += 0.10; // +10% bois
    }
    // Décrémenter bonus_remaining
    db.prepare('UPDATE relics SET bonus_remaining=? WHERE id=?')
      .run(relic.bonus_remaining - 1, relic.id);
  }
  // Appliquer aux ressources
  if (foodMultiplier !== 1.0) {
    resources.nourriture = Math.floor((resources.nourriture || 0) * foodMultiplier);
  }
  if (woodMultiplier !== 1.0) {
    resources.bois = Math.floor((resources.bois || 0) * woodMultiplier);
  }
  // Note: military and moral bonuses need to be applied elsewhere (military_power and moral)
  // We'll return them as extra modifiers
  return { militaryBonus, moralBonus };
}

function updateAnimalGroups(worldId, currentTick, allCivs, biomesMap) {
  const animalsPool = require('../data/animalsPool');
  const month = getCurrentMonth(currentTick);
  const season = month.season;

  // Récupérer tous les groupes animaux du monde
  const groups = db.prepare('SELECT * FROM animal_groups WHERE world_id = ?').all(worldId);
  // Pré-calculer les territoires civs
  const civTerritories = {};
  for (const civ of allCivs) {
    const territories = db.prepare('SELECT x, y FROM territories WHERE civ_id = ? AND world_id = ?').all(civ.id, worldId);
    civTerritories[civ.id] = territories.map(t => ({ x: t.x, y: t.y }));
  }

  // Mapping nom -> size_min depuis animalsPool
  const poolByName = {};
  for (const a of animalsPool) {
    poolByName[a.nom] = a;
  }

  for (const group of groups) {
    // --- RESPOWN si size <= 0 ---
    if (group.size <= 0) {
      const poolEntry = poolByName[group.nom];
      if (poolEntry) {
        try {
          db.prepare('UPDATE animal_groups SET size = ?, x = ?, y = ?, discovered_by = ? WHERE id = ?').run(
            poolEntry.size_min,
            group.respawn_x,
            group.respawn_y,
            '[]',
            group.id
          );
        } catch (err) {
          // ignore unique constraint violation
        }
      } else {
        // fallback
        try {
          db.prepare('UPDATE animal_groups SET size = 1, x = ?, y = ?, discovered_by = ? WHERE id = ?').run(
            group.respawn_x,
            group.respawn_y,
            '[]',
            group.id
          );
        } catch (err) {
          // ignore unique constraint violation
        }
      }
      continue; // respawné, on saute le reste pour ce tick
    }

    // --- MOUVEMENT ---
    let newX = group.x;
    let newY = group.y;

    // Vérifier si peureux et proche d'un territoire
    if (group.type === 'peureux') {
      let flee = false;
      for (const civ of allCivs) {
        const territories = civTerritories[civ.id];
        for (const t of territories) {
          const dist = Math.abs(t.x - group.x) + Math.abs(t.y - group.y); // distance de Manhattan
          if (dist <= 3) {
            flee = true;
            // direction opposée (simplifiée)
            const dx = group.x - t.x;
            const dy = group.y - t.y;
            const dirX = dx !== 0 ? (dx > 0 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1);
            const dirY = dy !== 0 ? (dy > 0 ? 1 : -1) : (Math.random() > 0.5 ? 1 : -1);
            newX = group.x + dirX * 2;
            newY = group.y + dirY * 2;
            break;
          }
        }
        if (flee) break;
      }
    }

    // Migrateurs en saison
    if (group.is_migratory === 1) {
      if (season === 'printemps') {
        // direction nord (y décroît? dans la carte y augmente vers le sud? on suppose y croît vers le sud)
        // On considère nord = -y, sud = +y
        newY = group.y - 5;
        group.migration_direction = 'nord';
      } else if (season === 'automne') {
        newY = group.y + 5;
        group.migration_direction = 'sud';
      } else {
        // hors saison : déplacement aléatoire 1 case
        const dirs = [[0,1],[1,0],[0,-1],[-1,0]];
        const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
        newX = group.x + dx;
        newY = group.y + dy;
      }
    } else {
      // agressif + oiseau non migrateurs : déplacement aléatoire 0-1 case
      if (group.type === 'agressif' || group.type === 'oiseau') {
        const dx = Math.floor(Math.random() * 3) - 1; // -1,0,1
        const dy = Math.floor(Math.random() * 3) - 1;
        newX = group.x + dx;
        newY = group.y + dy;
      }
    }

    // Limites de la carte (0‑255, 0‑191)
    newX = Math.max(0, Math.min(MAP_WIDTH - 1, newX));
    newY = Math.max(0, Math.min(MAP_HEIGHT - 1, newY));

    // --- DÉCOUVERTE ---
    const discoveredBy = parseJ(group.discovered_by, []);
    for (const civ of allCivs) {
      if (discoveredBy.includes(civ.id)) continue;
      const territories = civTerritories[civ.id];
      for (const t of territories) {
        const dist = Math.abs(t.x - group.x) + Math.abs(t.y - group.y);
        if (dist <= 5) {
          // Ajouter civ_id dans discovered_by
          discoveredBy.push(civ.id);
          // Ajouter dans last_consequences
          const lastConsequences = parseJ(civ.last_consequences, []);
          lastConsequences.push({
            type: 'animal_decouvert',
            nom: group.nom,
            type: group.type,
            description: `Vos éclaireurs ont repéré ${group.nom} à proximité de vos territoires.`
          });
          db.prepare('UPDATE civilizations SET last_consequences = ? WHERE id = ?').run(
            JSON.stringify(lastConsequences), civ.id
          );
          break;
        }
      }
    }

    // --- ATTAQUES AUTO (agressif uniquement) ---
    let attacked = false;
    if (group.type === 'agressif') {
      for (const civ of allCivs) {
        if (attacked) break;
        const territories = civTerritories[civ.id];
        for (const t of territories) {
          const dist = Math.abs(t.x - group.x) + Math.abs(t.y - group.y);
          if (dist <= 2) {
            // Calcul des dommages
            const damage = group.dangerosite * group.size * 0.05;
            // 50% chance nourriture, 50% chance morts
            const roll = Math.random();
            const hasArmy = (civ.army_soldiers > 0) || (civ.military_power > 10);
            const damageMultiplier = hasArmy ? 0.5 : 1.0;
            let foodLoss = 0;
            let deaths = 0;
            if (roll < 0.5) {
              foodLoss = Math.floor(damage * damageMultiplier);
              // réduire production nourriture ce tick (simplifié: réduire les ressources)
              const resources = parseJ(civ.resources, {});
              resources.nourriture = Math.max(0, (resources.nourriture || 0) - foodLoss);
              db.prepare('UPDATE civilizations SET resources = ? WHERE id = ?').run(
                JSON.stringify(resources), civ.id
              );
            } else {
              deaths = Math.floor(group.dangerosite * 0.5) * damageMultiplier;
              // tuer habitants
              const newPop = Math.max(0, (civ.population || 0) - deaths);
              db.prepare('UPDATE civilizations SET population = ? WHERE id = ?').run(newPop, civ.id);
            }
            // Ajouter last_consequences
            const lastConsequences = parseJ(civ.last_consequences, []);
            lastConsequences.push({
              type: 'attaque_animaux',
              nom: group.nom,
              morts: deaths,
              description: `${group.nom} a attaqué votre territoire. ${deaths > 0 ? deaths + ' habitants ont été tués.' : 'Vos réserves de nourriture ont été pillées.'}`
            });
            db.prepare('UPDATE civilizations SET last_consequences = ? WHERE id = ?').run(
              JSON.stringify(lastConsequences), civ.id
            );
            // Enregistrer last_attack_tick
            db.prepare('UPDATE animal_groups SET last_attack_tick = ? WHERE id = ?').run(currentTick, group.id);
            attacked = true;
            break;
          }
        }
      }
    }

    // Mettre à jour discovered_by
    if (discoveredBy.length !== parseJ(group.discovered_by, []).length) {
      db.prepare('UPDATE animal_groups SET discovered_by = ? WHERE id = ?').run(
        JSON.stringify(discoveredBy), group.id
      );
    }

    // Mettre à jour position si mouvement
    if (newX !== group.x || newY !== group.y) {
      try {
        db.prepare('UPDATE animal_groups SET x = ?, y = ? WHERE id = ?').run(newX, newY, group.id);
      } catch (err) {
        // ignore unique constraint violation
      }
    }
  }
}

function checkValueTensionEvents(civ, frustTicks, currentTick, worldId, events, biomesMap, freeLabor) {
  const valueEventTicks = parseJ(civ.value_event_ticks, {});
  const valeurs = parseJ(civ.valeurs, []);
  let armyDelta = 0;
  let resourceDelta = {};
  let gouvernement = null;
  let newBuilding = null;
  const consequences = [];
  let moralDelta = 0;
  let popDelta = 0;
  let doubleRevoltRisk = false;
  let rationingActive = false;

  for (const valeur of valeurs) {
    const ticks = frustTicks[valeur] || 0;
    if (ticks < 15) continue;

    const lastTick = valueEventTicks[valeur] || 0;
    const cooldown = currentTick - lastTick;
    const triggerLight = ticks >= 15 && cooldown >= 10;
    const triggerStrong = ticks >= 30 && cooldown >= 10;

    if (triggerLight) {
      // Événement léger
      if (valeur === 'guerre') {
        const rand = Math.floor(Math.random() * 3);
        if (rand === 0) {
          const added = Math.floor((civ.population || 0) * 0.05);
          armyDelta += added;
          consequences.push('Vos guerriers s\'entraînent entre eux, impatients d\'action.');
        } else if (rand === 1) {
          const deaths = Math.floor(2 + Math.random() * 3);
          popDelta -= deaths;
          armyDelta += Math.floor((civ.population || 0) * 0.03);
          consequences.push('Des rixes éclatent dans les rues. La frustration se transforme en violence.');
        } else {
          moralDelta += 4;
          armyDelta += Math.floor((civ.population || 0) * 0.02);
          consequences.push('Un tournoi de combat est organisé spontanément. La foule acclame ses champions.');
        }
      } else if (valeur === 'commerce') {
        const rand = Math.floor(Math.random() * 2);
        if (rand === 0) {
          // créer civ_processes de type commerce_expedition vers un voisin connu
          const knownCivs = parseJ(civ.discovered_civ_ids, []);
          if (knownCivs.length > 0) {
            const targetCivId = knownCivs[Math.floor(Math.random() * knownCivs.length)];
            db.prepare(
              `INSERT INTO civ_processes (civ_id, world_id, type, target, workers, ticks_remaining, state) VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(civ.id, worldId, 'commerce_expedition', targetCivId, 3, 5, 'en_cours');
            consequences.push('Des marchands partent d\'eux-mêmes vers les terres voisines.');
          }
        } else {
          const foodGain = Math.floor((civ.population || 0) * 0.5);
          resourceDelta.nourriture = (resourceDelta.nourriture || 0) + foodGain;
          consequences.push('Un marché intérieur spontané s\'organise. Les surplus circulent entre habitants.');
        }
      } else if (valeur === 'expansion') {
        const directions = ['nord', 'sud', 'est', 'ouest'];
        const dir = directions[Math.floor(Math.random() * directions.length)];
        expandTerritory(civ, dir, biomesMap, worldId, 2);
        consequences.push('Des familles quittent le centre et s\'établissent aux frontières.');
      } else if (valeur === 'exploration') {
        // Vérifier si une exploration est déjà en cours
        const existing = db.prepare('SELECT id FROM civ_processes WHERE civ_id = ? AND type = ? AND state = ?').get(civ.id, 'exploration', 'en_cours');
        if (!existing) {
          const workers = Math.max(3, Math.floor(freeLabor * 0.15));
          const ticksRemaining = Math.floor(workers / 2) + 2;
          const directions = ['nord', 'sud', 'est', 'ouest'];
          const direction = directions[Math.floor(Math.random() * directions.length)];
          db.prepare(
            `INSERT INTO civ_processes (civ_id, world_id, type, target, workers, ticks_remaining, state) VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(civ.id, worldId, 'exploration', direction, workers, ticksRemaining, 'en_cours');
          consequences.push(`Un groupe de ${workers} personnes part explorer vers le ${direction} pour ${ticksRemaining} mois, sans ordre du dirigeant.`);
        }
      } else if (valeur === 'savoir' || valeur === 'connaissance') {
        // Vérifier si bâtiment savoir existe
        const buildings = parseJ(civ.buildings, []);
        const hasSavoir = buildings.some(b => b.category === 'savoir');
        if (!hasSavoir) {
          newBuilding = { name: 'Cercle de savants', category: 'savoir', workers: 0, status: 'active' };
          consequences.push('Des érudits s\'organisent en cercle de savoirs sans attendre qu\'on les y autorise.');
        }
      } else if (valeur === 'spiritualite') {
        moralDelta += 5;
        consequences.push('Des rites spontanés s\'organisent. Le peuple cherche un sens à sa souffrance.');
      } else if (valeur === 'isolationnisme') {
        if (civ.active_trade_routes > 0) {
          // réduire une route
          db.prepare('UPDATE civilizations SET active_trade_routes = active_trade_routes - 1 WHERE id = ?').run(civ.id);
          consequences.push('Des militants isolationnistes sabotent une route commerciale étrangère.');
        } else {
          // annuler un process emissaire en cours
          db.prepare('DELETE FROM civ_processes WHERE civ_id = ? AND type LIKE ?').run(civ.id, '%emissaire%');
          consequences.push('Des émeutiers chassent les émissaires étrangers hors des murs.');
        }
      } else if (valeur === 'liberte') {
        const loss = Math.floor((civ.population || 0) * 0.02);
        popDelta -= loss;
        consequences.push('Des dissidents fuient la dictature ou sont emprisonnés. Le peuple gronde.');
      } else if (valeur === 'ordre') {
        // Redistribuer les travailleurs libres sur les bâtiments existants qui ont 0 workers
        const buildings = parseJ(civ.buildings, []);
        let workersAssigned = 0;
        let remainingFreeLabor = freeLabor;
        for (const b of buildings) {
          if (b.workers === 0 && remainingFreeLabor > 0) {
            const assign = Math.min(3, remainingFreeLabor);
            b.workers = assign;
            workersAssigned += assign;
            remainingFreeLabor -= assign;
            if (remainingFreeLabor <= 0) break;
          }
        }
        if (workersAssigned > 0) {
          db.prepare('UPDATE civilizations SET buildings = ? WHERE id = ?').run(JSON.stringify(buildings), civ.id);
          consequences.push('Des chefs de quartier s\'auto-organisent et remettent le peuple au travail.');
        }
      } else if (valeur === 'survie') {
        const foodGain = Math.floor((civ.population || 0) * 0.3);
        resourceDelta.nourriture = (resourceDelta.nourriture || 0) + foodGain;
        consequences.push('Des habitants partent chasser et cueillir dans la nature environnante. Les réserves augmentent légèrement.');
      } else if (valeur === 'art') {
        moralDelta += 6;
        consequences.push('Un festival de rue spontané éclate. Musiciens et conteurs envahissent les places.');
      }
      // Mettre à jour le cooldown
      valueEventTicks[valeur] = currentTick;
    }

    if (triggerStrong) {
      // Événement fort
      if (valeur === 'guerre') {
        if (civ.gouvernement !== 'dictature_militaire') {
          gouvernement = 'dictature_militaire';
          consequences.push('La faction militaire prend le contrôle. Le dirigeant civil est renversé.');
        }
      } else if (valeur === 'commerce') {
        const buildings = parseJ(civ.buildings, []);
        const hasCommerce = buildings.some(b => b.category === 'commerce');
        if (!hasCommerce) {
          newBuilding = { name: 'Place du marché', category: 'commerce', workers: 0, status: 'active' };
          consequences.push('Les guildes marchandes s\'imposent et construisent une place de marché.');
        }
      } else if (valeur === 'expansion') {
        const directions = ['nord', 'sud', 'est', 'ouest'];
        for (let i = 0; i < 4; i++) {
          const dir = directions[Math.floor(Math.random() * directions.length)];
          expandTerritory(civ, dir, biomesMap, worldId, 1);
        }
        consequences.push('Une vague migratoire pousse les frontières de la civilisation.');
      } else if (valeur === 'exploration') {
        // Ajouter un deuxième groupe dans une direction différente
        const existing = db.prepare('SELECT id FROM civ_processes WHERE civ_id = ? AND type = ? AND state = ?').all(civ.id, 'exploration', 'en_cours');
        if (existing.length > 0) {
          const directions = ['nord', 'sud', 'est', 'ouest'];
          const usedDirections = existing.map(p => p.target);
          const available = directions.filter(d => !usedDirections.includes(d));
          if (available.length > 0) {
            const direction = available[Math.floor(Math.random() * available.length)];
            const workers = Math.max(3, Math.floor(freeLabor * 0.15));
            const ticksRemaining = Math.floor(workers / 2) + 2;
            db.prepare(
              `INSERT INTO civ_processes (civ_id, world_id, type, target, workers, ticks_remaining, state) VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(civ.id, worldId, 'exploration', direction, workers, ticksRemaining, 'en_cours');
            consequences.push('Une second groupe d\'explorateurs part, refusant d\'attendre.');
          }
        }
      } else if (valeur === 'savoir' || valeur === 'connaissance') {
        resourceDelta.silex = (resourceDelta.silex || 0) + 30;
        consequences.push('Les savants expérimentent avec les matériaux disponibles et font une découverte.');
      } else if (valeur === 'spiritualite') {
        const buildings = parseJ(civ.buildings, []);
        const hasReligious = buildings.some(b => b.category === 'religieux');
        if (!hasReligious) {
          newBuilding = { name: 'Lieu de culte rudimentaire', category: 'religieux', workers: 0, status: 'active' };
          consequences.push('Une figure religieuse émerge du peuple et érige un premier lieu sacré.');
        }
      } else if (valeur === 'isolationnisme') {
        db.prepare('UPDATE civilizations SET active_trade_routes = 0 WHERE id = ?').run(civ.id);
        consequences.push('Le mouvement isolationniste triomphe : toutes les routes étrangères sont fermées.');
      } else if (valeur === 'liberte') {
        doubleRevoltRisk = true;
        consequences.push('La frustration éclate, doublant le risque de révolte ce tick.');
      } else if (valeur === 'ordre') {
        const added = Math.floor((civ.population || 0) * 0.02);
        armyDelta += added;
        consequences.push('Une milice citoyenne se forme spontanément pour maintenir l\'ordre.');
      } else if (valeur === 'survie') {
        rationingActive = true;
        consequences.push('Le rationnement s\'impose de lui-même. Le peuple serre la ceinture.');
      } else if (valeur === 'art') {
        const buildings = parseJ(civ.buildings, []);
        const hasArt = buildings.some(b => /atelier|art|sculpt|musique/i.test(b.name));
        if (!hasArt) {
          newBuilding = { name: 'Atelier collectif', category: 'art', workers: 0, status: 'active' };
          consequences.push('Des artistes construisent leur propre atelier, las d\'attendre une décision.');
        }
      }
      // Mettre à jour le cooldown aussi pour l'événement fort (même tick)
      valueEventTicks[valeur] = currentTick;
    }
  }

  // Sauvegarder value_event_ticks
  if (Object.keys(valueEventTicks).length > 0) {
    db.prepare('UPDATE civilizations SET value_event_ticks = ? WHERE id = ?').run(JSON.stringify(valueEventTicks), civ.id);
  }

  return { armyDelta, resourceDelta, gouvernement, newBuilding, consequences, moralDelta, popDelta, doubleRevoltRisk, rationingActive };
}


class CivEngine {
  constructor(io) {
    this.io = io;
    this.running  = false;
    this.worldId  = null;
    this.tickInterval = parseInt(process.env.CIV_TICK_INTERVAL_MS || '60000');
    this._timer   = null;
  }

  init() {
    migrate();
    civLLM.init();
    const { seed } = require('../../scripts/civSeed');
    let world = db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
    if (!world) {
      console.log('Aucun monde Civilisations → création...');
      this.worldId = seed();
    } else {
      const biomeCount = db.prepare('SELECT COUNT(*) as n FROM biomes WHERE world_id=?').get(world.id).n;
      if (biomeCount === 0) {
        console.log('⚠️  Monde Civilisations sans biomes → réinitialisation...');
        db.prepare('DELETE FROM worlds WHERE id=?').run(world.id);
        this.worldId = seed();
      } else {
        this.worldId = world.id;
        console.log(`✓ Monde Civilisations chargé (id=${this.worldId}, ${biomeCount} biomes)`);
      }
    }
  }

  reload() {
    const world = db.prepare("SELECT id FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
    if (world) this.worldId = world.id;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log(`✓ Moteur Civilisations démarré (tick toutes les ${this.tickInterval / 1000}s)`);
    this._scheduleNextTick();
  }

  stop() {
    this.running = false;
    if (this._timer) clearTimeout(this._timer);
  }

  _scheduleNextTick() {
    this._timer = setTimeout(async () => {
      try { await this._tick(); } catch (err) { console.error('Erreur tick civ:', err.message, err.stack); }
    }, this.tickInterval);
  }

  async _tick() {
    if (!this.running || !this.worldId) return;
    const startTime = Date.now();

    const worldRow = db.prepare('SELECT * FROM worlds WHERE id=?').get(this.worldId);
    if (!worldRow) return;
    const currentTick = (worldRow.tick || 0) + 1;

    // ─── Calendrier ──────────────────────────────────────────────────────────
    const month  = getCurrentMonth(currentTick);
    const season = month.season;
    const year   = getCurrentYear(currentTick);
    console.log(`[TICK ${currentTick}] === ${month.name}, An ${year} (${season}) ===`);

    const biomes = db.prepare('SELECT * FROM biomes WHERE world_id=?').all(this.worldId);
    const biomesMap = {};
    for (const b of biomes) biomesMap[`${b.x},${b.y}`] = b;

    const allCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    const events  = [];

    // ═══ ÉTAPE 1 : RESSOURCES, DÉMOGRAPHIE & ÉVÉNEMENTS ══════════════════════
    console.log(`[TICK ${currentTick}] === Étape 1 : ressources + événements ===`);
    for (const civ of allCivs) {
      const { newResources, consequences, births, isFamine, isWoodOut } = updateResources(civ, biomesMap, season);
      const { naturalDeaths, famineDelta, production, consumption, homelessDeaths, homeless, housed } = consequences;
      const pop    = civ.population || 0;

      // Événements aléatoires
      const eventResults = rollEvents(civ, season, events, currentTick);
      const baseNewPop = Math.max(0, pop + births - naturalDeaths - homelessDeaths + famineDelta);
      let { pop: newPop, res: finalResources } = applyEvents(civ, eventResults, newResources, baseNewPop);

      // Bonus des reliques
      const { militaryBonus, moralBonus } = applyRelicBonuses(civ.id, this.worldId, finalResources);

      // Messages des événements → last_consequences
      const eventMsgs = eventResults.map(e => e.msg);

      // Détection d'utilisation des reliques
      processRelicUsage(civ.id, this.worldId, currentTick, events);

      // Moral composite
      const civForMoral = { ...civ, population: newPop, resources: JSON.stringify(finalResources) };
      let { moral: newMoral, frustrations, satisfactions, moralLabel, frustration_ticks } = calculateMoral(civForMoral, currentTick);
      const newEnergy = Math.min(200, (civ.energy || 0) + satisfactions.length * 3);

      // Révolte si moral < 20
      let revoltLoss = 0;
      if (newMoral < 20 && newPop > 50) {
        const chance = (20 - newMoral) * 0.02;
        if (Math.random() < chance) {
          revoltLoss = Math.ceil(newPop * 0.03);
        }
      }

      // Mémoire structurée — Étape 1
      const year = getCurrentYear(currentTick);

      // — HISTOIRE : famine
      if (isFamine) {
        addMemoryEntry(civ.id, 'histoire', `An ${year} — Famine : réserves épuisées`);
      }

      // — HISTOIRE : révolte
      if (revoltLoss > 0) {
        addMemoryEntry(civ.id, 'histoire', `An ${year} — Révolte : -${revoltLoss} hab, 2 cases perdues`);
      }

      // — HISTOIRE : événements graves (morts > 15)
      for (const ev of eventResults) {
        if (ev.deaths >= 15) {
          addMemoryEntry(civ.id, 'histoire', `An ${year} — ${ev.type} : -${ev.deaths} habitants`);
        }
      }

      // — PRESSIONS : frustrations profondes
      for (const [valeur, ticks] of Object.entries(frustration_ticks || {})) {
        if (ticks === 10) { // seulement au tick 10 (pas à chaque tick)
          addMemoryEntry(civ.id, 'pressions', `An ${year} — Tension ${valeur} (${ticks} mois sans satisfaction)`);
        }
      }

      // — PRESSIONS : reset si valeur satisfaite
      for (const [valeur, ticks] of Object.entries(frustration_ticks || {})) {
        if (ticks === 0 && (parseJ(civ.frustration_ticks, {})[valeur] || 0) > 5) {
          // était frustrée, maintenant satisfaite → retirer l'entrée pressions
          const mem = parseJ(
            db.prepare('SELECT civ_memory FROM civilizations WHERE id=?').get(civ.id)?.civ_memory, {}
          );
          if (mem.pressions) {
            mem.pressions = mem.pressions.filter(e => !e.includes(`Tension ${valeur}`));
            db.prepare('UPDATE civilizations SET civ_memory=? WHERE id=?')
              .run(JSON.stringify(mem), civ.id);
          }
        }
      }

      // Travailleurs libres
      const processesRow = db.prepare("SELECT COALESCE(SUM(workers),0) as total FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'").get(civ.id, this.worldId);
      const procWorkers  = processesRow?.total || 0;
      const freeLabor    = checkWorkerConsistency({ ...civ, population: newPop }, procWorkers);

      // Événements de tension de valeur
      const tensionResult = checkValueTensionEvents(
        { ...civ, population: newPop, resources: JSON.stringify(finalResources) },
        frustration_ticks,
        currentTick, this.worldId, events, biomesMap, freeLabor
      );

      // Appliquer les deltas retournés
      if (tensionResult.armyDelta)
        civ.army_soldiers = (civ.army_soldiers || 0) + tensionResult.armyDelta;
      if (tensionResult.resourceDelta)
        for (const [r, v] of Object.entries(tensionResult.resourceDelta))
          finalResources[r] = Math.max(0, (finalResources[r] || 0) + v);
      if (tensionResult.gouvernement)
        db.prepare('UPDATE civilizations SET gouvernement=? WHERE id=?').run(tensionResult.gouvernement, civ.id);
      if (tensionResult.newBuilding) {
        const bldgs = parseJ(civ.buildings, []);
        bldgs.push(tensionResult.newBuilding);
        db.prepare('UPDATE civilizations SET buildings=? WHERE id=?').run(JSON.stringify(bldgs), civ.id);
      }
      if (tensionResult.consequences?.length)
        eventMsgs.push(...tensionResult.consequences);
      // moral bonus depuis tension (fêtes, festivals...)
      if (tensionResult.moralDelta)
        newMoral = Math.min(100, newMoral + tensionResult.moralDelta);
      if (tensionResult.popDelta)
        newPop = Math.max(0, newPop + tensionResult.popDelta);

      // Limiter l'armée à 60% de la population
      const newSoldiers = Math.min(civ.army_soldiers || 0, Math.floor(newPop * 0.6));
      civ.army_soldiers = newSoldiers;

      // Puissance militaire
      const baseMilitary = getMilitaryPower(civ.army_soldiers || 0, civ.age_tech);
      const newMilitary = Math.floor(baseMilitary * (1 + militaryBonus));

      // Logs
      console.log(`  [CIV] ${civ.nom} | pop: ${pop}→${newPop} (naiss:+${births}, morts:-${naturalDeaths}, froid:-${homelessDeaths}, famine:${famineDelta}) | saison: ${season}`);
      if (homelessDeaths > 0) console.log(`    ⚠️ SANS-ABRI: ${homeless} sans logement → -${homelessDeaths} morts de froid`);
      if (isWoodOut) console.log(`    ❄️ BOIS ÉPUISÉ: pas de chauffage !`);
      const surplus = (production.nourriture || 0) - (consumption.nourriture || 0);
      if (isFamine) console.log(`    ⚠️ FAMINE !`);
      if (eventMsgs.length) console.log(`    📋 Événements: ${eventMsgs.join(' | ')}`);
      console.log(`  [MORAL] ${newMoral}/100 (${moralLabel})`);
      if (satisfactions.length) console.log(`    ✅ ${satisfactions.join(' | ')}`);
      if (frustrations.length)  console.log(`    ⚠️  ${frustrations.join(' | ')}`);
      console.log(`  [WORKERS] pop:${newPop} | proc:${procWorkers} | armée:${civ.army_soldiers || 0} | libre:${freeLabor}`);

      // Fusionner last_consequences existant avec les nouveaux messages
      const current = db.prepare('SELECT last_consequences FROM civilizations WHERE id=?').get(civ.id);
      const existing = parseJ(current.last_consequences, []);
      const mergedConsequences = [...existing, ...eventMsgs];

      db.prepare(`UPDATE civilizations SET
        resources=?, energy=?, army_soldiers=?, population=?, moral=?,
        military_power=?, frustration_ticks=?, last_consequences=?
        WHERE id=?`).run(
        JSON.stringify(finalResources), newEnergy, newSoldiers,
        Math.max(0, newPop - revoltLoss), Math.max(0, Math.min(100, newMoral + moralBonus)), newMilitary,
        JSON.stringify(frustration_ticks || {}),
        JSON.stringify(mergedConsequences),
        civ.id
      );

      if (newPop <= 0) {
        db.prepare("UPDATE civilizations SET status='effondree', died_at=datetime('now') WHERE id=?").run(civ.id);
        events.push({ type: 'effondrement', description: `La civilisation ${civ.nom} vient de s'effondrer...`, civ_ids: [civ.id] });
      }
      if (isFamine) events.push({ type: 'famine', description: `Famine dans ${civ.nom} ! Les réserves de nourriture sont épuisées.`, civ_ids: [civ.id] });
      if (revoltLoss > 0) {
        const lostCells = db.prepare('SELECT id FROM territories WHERE civ_id=? AND world_id=? ORDER BY RANDOM() LIMIT 2').all(civ.id, this.worldId);
        for (const cell of lostCells) db.prepare('DELETE FROM territories WHERE id=?').run(cell.id);
        if (lostCells.length) db.prepare('UPDATE civilizations SET territory_count=MAX(0,territory_count-?) WHERE id=?').run(lostCells.length, civ.id);
        events.push({ type: 'revolte', description: `Révolte dans ${civ.nom} (moral ${newMoral}) ! -${revoltLoss} déserteurs.`, civ_ids: [civ.id] });
        console.log(`  [REVOLT] ${civ.nom}: moral=${newMoral} → -${revoltLoss} pop`);
      }

      // Auto-expansion si densité > 50 hab/case
      const terrCount = civ.territory_count || 1;
      if (newPop / terrCount > 50 && newPop > 0) {
        const dirs = ['nord', 'sud', 'est', 'ouest'];
        const dir  = dirs[Math.floor(Math.random() * dirs.length)];
        const added = expandTerritory(civ, dir, biomesMap, this.worldId, 1 + Math.floor(newPop / terrCount / 50));
        if (added > 0) {
          console.log(`  [EXPAND] ${civ.nom}: densité élevée → +${added} cases auto`);
          discoverRelicsInTerritory(civ.id, this.worldId, currentTick, events);
        }
      }
    }

    // ═══ ÉTAPE 2 : PROCESSUS ACTIFS ══════════════════════════════════════════
    const aliveCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    for (const civ of aliveCivs) {
      const { completed, updates } = advanceProcesses(civ.id, this.worldId, civ.buildings, biomesMap, civ);

      if (Object.keys(updates).length > 0) {
        const { _military_bonus, _moral_bonus, _defense_bonus, ...dbUpdates } = updates;
        if (dbUpdates.buildings)
          db.prepare('UPDATE civilizations SET buildings=? WHERE id=?').run(dbUpdates.buildings, civ.id);
        if (_military_bonus)
          db.prepare('UPDATE civilizations SET military_power=MIN(1000,military_power+?) WHERE id=?').run(_military_bonus, civ.id);
        if (_moral_bonus)
          db.prepare('UPDATE civilizations SET moral=MIN(100,moral+?) WHERE id=?').run(_moral_bonus, civ.id);
      }

      for (const proc of completed) {
        if (proc.type === 'construction') {
          const autoW = proc.workers || 0;
          const roleInfo = proc.role ? ` [${proc.role}]` : '';
          events.push({ type: 'construction', description: `${civ.nom} a terminé "${proc.target}"${roleInfo} — ${autoW > 0 ? autoW + ' pers. affectées' : 'construction achevée'}.`, civ_ids: [civ.id] });
          console.log(`  [PROC] construction terminée: ${proc.target}${roleInfo} | auto-workers: ${autoW}`);
          addMemoryEntry(civ.id, 'savoir', `An ${year} — ${proc.target} construit`);
        } else if (proc.type === 'exploration') {
          const added = proc.territory_added || 0;
          events.push({ type: 'exploration', description: `Les éclaireurs de ${civ.nom} rentrent (${proc.target}) : +${added} territoires.`, civ_ids: [civ.id] });
          // Découverte de reliques sur les nouveaux territoires
          discoverRelicsInTerritory(civ.id, this.worldId, currentTick, events);
          addMemoryEntry(civ.id, 'savoir', `An ${year} — Territoire exploré : +${added} cases`);
        } else if (proc.type === 'mission') {
          if (proc.workers > 0)
            events.push({ type: 'mission', description: `${civ.nom} : mission "${proc.target}" terminée — ${proc.workers} personnes de retour.`, civ_ids: [civ.id] });
        } else if (proc.resolve_type === 'espionnage') {
          const latestCiv = db.prepare('SELECT * FROM civilizations WHERE id=?').get(civ.id);
          const result = resolveSpying(latestCiv, proc.target_civ_id, aliveCivs, currentTick);
          events.push({ type: result.success ? 'espionnage' : 'echec', description: `${civ.nom} : ${result.message}`, civ_ids: [civ.id] });
          if (result.captured && proc.target_civ_id)
            events.push({ type: 'espionnage', description: result.targetMessage || '', civ_ids: [proc.target_civ_id] });
        } else if (proc.resolve_type === 'commerce_expedition') {
          const latestCiv = db.prepare('SELECT * FROM civilizations WHERE id=?').get(civ.id);
          const result = resolveTradeExpedition(latestCiv, proc.target_civ_id, aliveCivs, currentTick);
          events.push({ type: result.success ? 'commerce' : 'echec', description: `${civ.nom} : ${result.message}`, civ_ids: [civ.id] });
          if (result.success) {
            const targetName = aliveCivs.find(c => c.id === proc.target_civ_id)?.nom || 'inconnu';
            addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Route commerciale ouverte avec ${targetName}`);
          }
        } else if (proc.resolve_type === 'emissaire') {
          const targetId = proc.target_civ_id;
          if (targetId) {
            const pairMin = Math.min(civ.id, targetId), pairMax = Math.max(civ.id, targetId);
            db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
              .run(this.worldId, pairMin, pairMax, 'neutre');
            const targetName = aliveCivs.find(c => c.id === targetId)?.nom || 'inconnu';
            events.push({ type: 'diplomatie', description: `${civ.nom} établit un contact avec ${targetName}.`, civ_ids: [civ.id, targetId] });
            addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Émissaire envoyé à ${targetName}`);
          }
        }
      }
    }

    // ═══ ÉTAPE 2b : BROUILLARD DE GUERRE ════════════════════════════════════
    const aliveCivIds = aliveCivs.map(c => c.id);
    for (const civ of aliveCivs) {
      const newlyFound = discoverAdjacentCivs(civ.id, this.worldId, aliveCivIds);
      for (const foundId of newlyFound) {
        const foundCiv = aliveCivs.find(c => c.id === foundId);
        if (foundCiv) {
          const isNew = checkFrontierContact(civ, foundCiv, this.worldId, currentTick);
          events.push({ type: 'decouverte', description: `${civ.nom} découvre : "${foundCiv.nom}" !`, civ_ids: [civ.id, foundId] });
          // AJOUTER : écrire dans last_consequences pour déclencher l'appel LLM
          const civRow = db.prepare('SELECT last_consequences FROM civilizations WHERE id=?').get(civ.id);
          const lc = parseJ(civRow?.last_consequences, []);
          lc.push({ type: 'premier_contact', nom: foundCiv.nom, civ_id: foundId });
          db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?')
            .run(JSON.stringify(lc), civ.id);

          // Écrire premier_contact aussi pour foundCiv
          const foundCivRow = db.prepare('SELECT last_consequences FROM civilizations WHERE id=?').get(foundId);
          const lcFound = parseJ(foundCivRow?.last_consequences, []);
          lcFound.push({ type: 'premier_contact', nom: civ.nom, civ_id: civ.id });
          db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?')
            .run(JSON.stringify(lcFound), foundId);

          // Mémoire
          addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Premier contact : ${foundCiv.nom}`);
          addMemoryEntry(foundId, 'diplomatie', `An ${year} — Premier contact : ${civ.nom}`);
          console.log(`  [FOG] ${civ.nom} découvre ${foundCiv.nom} !`);
          if (isNew) {
            // Relation diplomatique actuelle
            const pairMin = Math.min(civ.id, foundCiv.id);
            const pairMax = Math.max(civ.id, foundCiv.id);
            const relRow = db.prepare('SELECT relation FROM diplomacy WHERE world_id=? AND civ_a_id=? AND civ_b_id=?').get(this.worldId, pairMin, pairMax);
            const relation = relRow?.relation || 'neutre';
            addMemoryEntry(civ.id, 'diplomatie', `An ${year} — Premier contact : ${foundCiv.nom} (${relation})`);
          }
        }
      }
    }

    // ═══ MISE À JOUR DES GROUPES ANIMAUX ════════════════════════════════════
    updateAnimalGroups(this.worldId, currentTick, aliveCivs, biomesMap);

    // ═══ ÉTAPE 3 : DÉCISIONS LLM ════════════════════════════════════════════
    const liveCivs    = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
    const thoughtLogs = [];

    for (const civ of liveCivs) {
      const activeCount = db.prepare(
        "SELECT COUNT(*) as n FROM civ_processes WHERE civ_id=? AND world_id=? AND state='en_cours'"
      ).get(civ.id, this.worldId).n;

      const isIdle      = activeCount === 0;
      const isFamine    = (parseJ(civ.resources, {}).nourriture || 0) <= 0;
      const isUnderAttack = db.prepare(
        "SELECT COUNT(*) as n FROM diplomacy WHERE world_id=? AND (civ_a_id=? OR civ_b_id=?) AND relation='guerre'"
      ).get(this.worldId, civ.id, civ.id).n > 0;
      const hasNoHousing = normalizeBuildings(civ.buildings).filter(b => b.role === 'habitation' || b.category === 'habitation').length === 0;
      const isWinter     = season === 'hiver';

      // Calcul du surplus alimentaire
      const buildings = normalizeBuildings(civ.buildings);
      let foodProduction = 0;
      for (const struct of buildings) {
        if (!(struct.workers > 0)) continue;
        const { resource, amount } = calculateProduction(struct, biomesMap);
        if (resource === 'nourriture' && amount > 0) foodProduction += amount;
      }
      const foodConsumption = Math.round(((civ.population || 0) + (civ.army_soldiers || 0) * 0.5) * 0.15);
      const foodSurplus = foodProduction - foodConsumption;

      // Appel LLM si: idle, famine, sous attaque, pas de logement en automne/hiver, ou urgent
      const lastConseqs = parseJ(civ.last_consequences, []);
      const hasRelicDiscovered = lastConseqs.some(c => c.type === 'relique_decouverte' || c.type === 'relique_incomprise');
      const hasFirstContact = lastConseqs.some(c => c.type === 'premier_contact');
      const needsDecision = isIdle || isFamine || isUnderAttack || (hasNoHousing && ['automne', 'hiver'].includes(season)) || hasRelicDiscovered || hasFirstContact || foodSurplus < 0;

      if (!needsDecision) {
        console.log(`  [CIV] ${civ.nom}: en cours (${activeCount} processus) → pas d'appel LLM`);
        continue;
      }

      const reason = isIdle ? 'idle' : isFamine ? 'FAMINE' : isUnderAttack ? 'SOUS_ATTAQUE' : foodSurplus < 0 ? 'DEFICIT' : hasRelicDiscovered ? 'RELIQUE' : hasFirstContact ? 'PREMIER_CONTACT' : 'URGENT_LOGEMENT';
      console.log(`  [CIV] ${civ.nom}: appel LLM (${reason})`);

      const moralCtx  = calculateMoral(civ, currentTick);
      const context   = buildCivContext(civ, liveCivs, this.worldId, currentTick, biomesMap, season, month.name, year);
      context.frustrations     = moralCtx.frustrations;
      context.satisfactions    = moralCtx.satisfactions;
      context.moralLabel       = moralCtx.moralLabel;
      context.neighbors_info   = buildNeighborInfo(civ, liveCivs);
      // V4 — Mémoire stratégique et frustration cumulée
      context.frustration_ticks = moralCtx.frustration_ticks || {};
      context.memoire = parseJ(civ.memoire, null) || {
        projet_principal:     'Établir les premières structures de survie.',
        posture_diplomatique: 'Le monde autour est inconnu. Nous restons sur nos gardes.',
        inquietude_majeure:   'Nous ne savons pas ce qui nous entoure.',
      };
      console.log(`  [QUESTION] ${(moralCtx.frustrations[0] || moralCtx.satisfactions[0] || 'Situation stable').slice(0, 80)}`);

      const { strategie, effets_text, actions, raison, nouveauCap, souhait } = await civLLM.decide(context);
      // V4 — Sauvegarder la mémoire stratégique
      if (nouveauCap) {
        db.prepare('UPDATE civilizations SET memoire=? WHERE id=?').run(JSON.stringify(nouveauCap), civ.id);
      }
      if (souhait) {
        db.prepare('UPDATE civilizations SET current_wish=? WHERE id=?').run(souhait, civ.id);
      }
      thoughtLogs.push({ civId: civ.id, actions, raison: strategie });

      const effects   = parseEffets(effets_text);
      let civState    = { ...civ };
      let allUpdates  = {};

      for (const effect of effects) {
        Object.assign(civState, allUpdates);
        const updates = resolveEffect(effect, civState, liveCivs, this.worldId, biomesMap, events, currentTick);
        Object.assign(allUpdates, updates);
      }

      if (Object.keys(allUpdates).length > 0) {
        const fields = Object.keys(allUpdates).filter(k => !k.startsWith('_')).map(k => `${k}=?`).join(', ');
        const values = Object.entries(allUpdates).filter(([k]) => !k.startsWith('_')).map(([, v]) => v);
        if (fields) db.prepare(`UPDATE civilizations SET ${fields} WHERE id=?`).run(...values, civ.id);
      }

      const refreshed = db.prepare('SELECT population, territory_count, moral FROM civilizations WHERE id=?').get(civ.id);
      console.log(`  [CIV] ${civ.nom}: "${(strategie || '').slice(0, 60)}..." | pop=${refreshed?.population} moral=${refreshed?.moral}`);
    }

    // ═══ ÉTAPE 4 : PERSISTER ════════════════════════════════════════════════
    db.transaction(() => {
      db.prepare('UPDATE worlds SET tick=? WHERE id=?').run(currentTick, this.worldId);

      const stmtLog = db.prepare('INSERT INTO civ_thought_logs (civ_id, world_id, tick, actions, raison) VALUES (?,?,?,?,?)');
      for (const log of thoughtLogs)
        stmtLog.run(log.civId, this.worldId, currentTick, JSON.stringify(log.actions), log.raison);

      const stmtEv = db.prepare('INSERT INTO events (world_id, tick, type, description, species_ids) VALUES (?,?,?,?,?)');
      for (const ev of events)
        stmtEv.run(this.worldId, currentTick, ev.type, ev.description, JSON.stringify(ev.civ_ids || []));
    })();

    // ═══ ÉTAPE 5 : BROADCAST ════════════════════════════════════════════════
    this._broadcast(currentTick, events, { year, season, monthName: month.name });

    const elapsed = Date.now() - startTime;
    console.log(`[CIV] Tick ${currentTick} (${month.name}, An ${year}) en ${elapsed}ms | ${liveCivs.length} civilisations`);

    if (this.running) this._scheduleNextTick();
  }

  _broadcast(currentTick, newEvents, calendar = {}) {
    const civs         = db.prepare('SELECT * FROM civilizations WHERE world_id=?').all(this.worldId);
    const territories  = db.prepare('SELECT civ_id, x, y FROM territories WHERE world_id=?').all(this.worldId);
    const recentEvents = db.prepare('SELECT * FROM events WHERE world_id=? ORDER BY id DESC LIMIT 30').all(this.worldId)
      .map(e => ({ ...e, civ_ids: parseJ(e.species_ids, []) }));
    const thoughtLogs  = db.prepare('SELECT * FROM civ_thought_logs WHERE world_id=? ORDER BY id DESC LIMIT 20').all(this.worldId)
      .map(t => ({ ...t, actions: parseJ(t.actions, []) }));
    // Reliques découvertes par chaque civilisation
    const relics = db.prepare('SELECT * FROM relics WHERE world_id=?').all(this.worldId);
    const relicsByCiv = {};
    for (const r of relics) {
        const civId = r.discovered_by;
        if (civId !== null) {
            if (!relicsByCiv[civId]) relicsByCiv[civId] = [];
            relicsByCiv[civId].push(r);
        }
    }

    // Groupes animaux découverts par chaque civilisation
    const animalGroups = db.prepare('SELECT * FROM animal_groups WHERE world_id=?').all(this.worldId);
    const animalGroupsByCiv = {};
    for (const ag of animalGroups) {
      const discovered = parseJ(ag.discovered_by, []);
      for (const civId of discovered) {
        if (!animalGroupsByCiv[civId]) animalGroupsByCiv[civId] = [];
        animalGroupsByCiv[civId].push(ag);
      }
    }

    this.io.emit('civ:tick:update', {
      tick: currentTick,
      year: calendar.year || 1,
      season: calendar.season || 'ete',
      monthName: calendar.monthName || 'Juin',
      civs: civs.map(c => ({
        id: c.id, nom: c.nom, color: c.color, creator_name: c.creator_name,
        population: c.population, moral: c.moral,
        resources: parseJ(c.resources, {}),
        army_soldiers: c.army_soldiers || 0,
        territory_count: c.territory_count, status: c.status,
        gouvernement: c.gouvernement, valeurs: parseJ(c.valeurs, []),
        capital_x: c.capital_x, capital_y: c.capital_y,
        buildings: normalizeBuildings(c.buildings),
        last_consequences: parseJ(c.last_consequences, []),
        military_power: c.military_power,
        relics: relicsByCiv[c.id] || [],
        animal_groups: animalGroupsByCiv[c.id] || [],
      })),
      territories,
      new_events: newEvents,
      recent_events: recentEvents,
      thought_logs: thoughtLogs,
    });
  }
}

module.exports = { CivEngine };
