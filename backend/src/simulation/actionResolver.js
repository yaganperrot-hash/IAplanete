// Résolution des actions des créatures (déplacements, combats, reproduction, alimentation)

const { MAP_WIDTH, MAP_HEIGHT } = require('./mapGenerator');

const DIRECTIONS = {
  nord: { dx: 0, dy: -1 },
  sud: { dx: 0, dy: 1 },
  est: { dx: 1, dy: 0 },
  ouest: { dx: -1, dy: 0 },
  nord_est: { dx: 1, dy: -1 },
  nord_ouest: { dx: -1, dy: -1 },
  sud_est: { dx: 1, dy: 1 },
  sud_ouest: { dx: -1, dy: 1 },
};

// Biomes compatibles par milieu
const MILIEU_BIOMES = {
  terrestre: ['tropical_forest', 'temperate_forest', 'savanna', 'desert_hot', 'desert_cold', 'mountain', 'hills', 'volcano', 'swamp', 'coast', 'prairie', 'tundra'],
  aquatique: ['ocean_deep', 'reef', 'ocean', 'coast', 'swamp'],
  amphibie: ['tropical_forest', 'temperate_forest', 'savanna', 'desert_hot', 'desert_cold', 'mountain', 'hills', 'volcano', 'swamp', 'coast', 'prairie', 'tundra', 'ocean_deep', 'reef', 'ocean'],
  aérien: ['tropical_forest', 'temperate_forest', 'savanna', 'desert_hot', 'desert_cold', 'mountain', 'hills', 'volcano', 'swamp', 'coast', 'prairie', 'tundra'],
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Biomes froids et chauds pour les résistances
const COLD_BIOMES = ['desert_cold', 'tundra', 'mountain'];
const HOT_BIOMES = ['desert_hot', 'volcano', 'savanna'];

// Pénalité climatique si la créature est dans un biome inadapté
function applyClimatePenalty(creature, biome, params) {
  if (!biome) return creature;
  const milieu = params.milieu || 'terrestre';
  const habitats = params.habitats || [];
  const traits = params.traits || [];
  const compatibleBiomes = MILIEU_BIOMES[milieu] || MILIEU_BIOMES.terrestre;

  // Hors milieu naturel → perte d'énergie/santé
  if (!compatibleBiomes.includes(biome.biome_type)) {
    return { ...creature, energy: Math.max(0, creature.energy - 8), health: Math.max(0, creature.health - 3) };
  }

  // Résistance froid : ignore la pénalité des biomes froids
  if (COLD_BIOMES.includes(biome.biome_type) && !traits.includes('resistance_froid')) {
    if (!habitats.includes(biome.biome_type)) {
      return { ...creature, energy: Math.max(0, creature.energy - 3) };
    }
  }

  // Résistance chaleur : ignore la pénalité des biomes chauds
  if (HOT_BIOMES.includes(biome.biome_type) && !traits.includes('resistance_chaleur')) {
    if (!habitats.includes(biome.biome_type)) {
      return { ...creature, energy: Math.max(0, creature.energy - 3) };
    }
  }

  // Habitat non favori → légère pénalité
  if (habitats.length > 0 && !habitats.includes(biome.biome_type)
      && !COLD_BIOMES.includes(biome.biome_type) && !HOT_BIOMES.includes(biome.biome_type)) {
    return { ...creature, energy: Math.max(0, creature.energy - 2) };
  }

  return creature;
}

// Durée de gestation selon la taille (en ticks)
function gestationDuration(taille) {
  if (taille <= 2) return randInt(2, 3);
  if (taille <= 4) return randInt(5, 8);
  if (taille <= 6) return randInt(10, 15);
  if (taille <= 8) return randInt(20, 30);
  return randInt(40, 60);
}

// Construire le contexte d'une espèce pour le mock LLM
function buildContext(speciesCreatures, allCreatures, speciesMap, biomesMap, worldState, currentTick) {
  if (!speciesCreatures.length) return null;

  // Représentant : créature avec l'énergie médiane (plus représentative que [0])
  const sorted = [...speciesCreatures].sort((a, b) => a.energy - b.energy);
  const rep = sorted[Math.floor(sorted.length / 2)];
  const sp = speciesMap[rep.species_id];
  if (!sp) return null;

  const params = sp.params || {};
  const stats = sp.stats || {};

  // Moyennes espèce pour les décisions LLM (plus fiables que le seul représentant)
  const avgEnergy = Math.round(speciesCreatures.reduce((s, c) => s + c.energy, 0) / speciesCreatures.length);
  const avgHealth = Math.round(speciesCreatures.reduce((s, c) => s + c.health, 0) / speciesCreatures.length);

  // Créatures proches (rayon de détection)
  const detectionRange = stats.portee_detection || 5;
  const nearby = allCreatures.filter(c =>
    c.id !== rep.id &&
    c.status === 'alive' &&
    distance(rep, c) <= detectionRange
  );

  // Cadavres proches (pour charognards)
  const nearbyCadavres = allCreatures.filter(c =>
    c.status === 'cadavre' &&
    distance(rep, c) <= detectionRange
  );

  const nearbyPrey = nearby.filter(c => {
    const otherSp = speciesMap[c.species_id];
    if (!otherSp) return false;
    const myRegime = params.regime || 'omnivore';
    const otherRegime = (otherSp.params || {}).regime || 'omnivore';
    return (myRegime === 'carnivore' && otherRegime === 'herbivore') ||
           (myRegime === 'omnivore' && otherRegime === 'herbivore') ||
           (myRegime === 'charognard' && c.status === 'cadavre');
  });

  const nearbyThreats = nearby.filter(c => {
    const otherSp = speciesMap[c.species_id];
    if (!otherSp) return false;
    const otherRegime = (otherSp.params || {}).regime || 'omnivore';
    const myRegime = params.regime || 'omnivore';
    return otherRegime === 'carnivore' && myRegime !== 'carnivore';
  });

  const nearbyAllies = nearby.filter(c => c.species_id === rep.species_id);
  // Fallback : si pop >= 10, garantit au moins 1 partenaire (représentant peut être isolé)
  const nearbyMatesRaw = nearbyAllies.filter(c => c.energy > 50).length;
  const nearbyMates = nearbyMatesRaw > 0 ? nearbyMatesRaw : (speciesCreatures.length >= 10 ? 1 : 0);

  const biome = biomesMap[`${rep.x},${rep.y}`] || {};
  const nearbyFood = biome.food_level > 10 ? 1 : 0;   // aligne avec le seuil MANGER
  const nearbyWater = biome.water_level > 10 ? 1 : 0;
  const isNight = (worldState.weather_state || {}).isNight || false;

  // === Système de pulsion reproductive ===
  const avgRepDrive = Math.round(speciesCreatures.reduce((s, c) => s + (c.repro_drive || 0), 0) / speciesCreatures.length);
  const gestatingCreatures = speciesCreatures.filter(c => (c.gestation_ticks || 0) > 0);
  const gestationMin = gestatingCreatures.length > 0 ? Math.min(...gestatingCreatures.map(c => c.gestation_ticks)) : 0;

  // Partenaires prêts (pulsion >= 80) dans le champ de détection
  const readyMates = speciesCreatures.filter(c => c.id !== rep.id && (c.repro_drive || 0) >= 80);
  const adjacentReadyMates = readyMates.filter(m => distance(rep, m) <= 2).length;
  const nearbyReadyMates = readyMates.filter(m => distance(rep, m) <= detectionRange).length;

  // Fallback : si pop >= 10 et pulsion haute, garantir 1 partenaire potentiel
  const nearbyMatesEffective = nearbyReadyMates > 0 ? nearbyReadyMates
    : (speciesCreatures.length >= 10 && avgRepDrive >= 80 ? 1 : 0);

  // Petits à proximité (âge < 10 = juvéniles récents)
  const nearbyPetits = speciesCreatures.filter(c => c.age < 10 && distance(rep, c) <= 5).length;

  // Statut de reproduction (résumé lisible pour le LLM)
  let reproStatus;
  if (gestatingCreatures.length > 0)    reproStatus = `en_gestation(${gestationMin}_ticks_restants)`;
  else if (avgRepDrive < 30)            reproStatus = 'immature';
  else if (avgRepDrive < 80)            reproStatus = `pulsion_${avgRepDrive}/100`;
  else if (adjacentReadyMates > 0)      reproStatus = 'prêt_partenaire_adjacent';
  else if (nearbyReadyMates > 0)        reproStatus = `prêt_partenaire_proche(${nearbyReadyMates})`;
  else                                  reproStatus = 'prêt_sans_partenaire';

  const canReproduce = avgRepDrive >= 80 && gestatingCreatures.length === 0;

  return {
    energy: avgEnergy,
    health: avgHealth,
    regime: params.regime || 'omnivore',
    social: params.social || 'solitaire',
    rythme: params.rythme || 'diurne',
    taille: params.taille || 5,
    traits: params.traits || [],
    habitats: params.habitats || [],
    isNight,
    nearbyFood,
    nearbyWater,
    nearbyPrey: nearbyPrey.length,
    nearbyThreats: nearbyThreats.length,
    nearbyAllies: nearbyAllies.length,
    nearbyMates: nearbyMatesEffective,
    nearbyCadavres: nearbyCadavres.length,
    biomeHabitable: true,
    canReproduce,
    repro_drive: avgRepDrive,
    reproStatus,
    adjacentReadyMates,
    nearbyPetits,
    nearbyPreyList: nearbyPrey,
    nearbyThreatList: nearbyThreats,
    nearbyCadavreList: nearbyCadavres,
    biome,
  };
}

// Appliquer un mouvement à une créature
function applyMove(creature, dx, dy, biomesMap) {
  const newX = clamp(creature.x + dx, 0, MAP_WIDTH - 1);
  const newY = clamp(creature.y + dy, 0, MAP_HEIGHT - 1);

  const biome = biomesMap[`${newX},${newY}`];
  const params = creature._params || {};
  const milieu = params.milieu || 'terrestre';
  const compatibleBiomes = MILIEU_BIOMES[milieu] || MILIEU_BIOMES.terrestre;

  if (biome && !compatibleBiomes.includes(biome.biome_type)) {
    return creature; // Reste sur place si biome incompatible
  }

  return { ...creature, x: newX, y: newY };
}

// Résoudre un combat entre un attaquant et une cible
function resolveCombat(attacker, target, attackerStats, targetStats) {
  const atkDmg = (attackerStats.degats || 15) * (0.8 + Math.random() * 0.4);
  const defDmg = (targetStats.degats || 10) * (0.4 + Math.random() * 0.3); // Contre-attaque réduite

  const updatedTarget = { ...target, health: Math.max(0, target.health - Math.round(atkDmg)) };
  const updatedAttacker = { ...attacker, health: Math.max(0, attacker.health - Math.round(defDmg)) };

  const targetDied = updatedTarget.health <= 0;
  if (targetDied) {
    updatedTarget.status = 'cadavre'; // Cadavre persistant 3 ticks
    updatedTarget.died_at = new Date().toISOString();
    updatedAttacker.energy = Math.min(100, updatedAttacker.energy + 40); // Repas immédiat
  }

  return { attacker: updatedAttacker, target: updatedTarget, targetDied };
}

// Créer des descendants
function reproduce(parent, speciesStats, biomesMap) {
  const portee = speciesStats.taille_portee || 2;
  const count = randInt(1, portee);
  const offspring = [];

  for (let i = 0; i < count; i++) {
    const dx = randInt(-2, 2);
    const dy = randInt(-2, 2);
    const nx = clamp(parent.x + dx, 0, MAP_WIDTH - 1);
    const ny = clamp(parent.y + dy, 0, MAP_HEIGHT - 1);

    const mutated = Math.random() < 0.15;

    offspring.push({
      species_id: parent.species_id,
      world_id: parent.world_id,
      x: nx,
      y: ny,
      energy: 60,
      health: 100,
      age: 0,
      status: 'alive',
      parent_id: parent.id,
      last_reproduced_at: 0,
      _mutated: mutated,
    });
  }

  return offspring;
}

/**
 * Résoudre les actions de toutes les espèces
 * Retourne les créatures mises à jour, les événements générés, et les kills par espèce
 */
function resolveActions(actionsBySpecies, creatures, speciesMap, biomesMap, worldState, currentTick) {
  // Index créatures par ID (vivantes + cadavres)
  const creaturesById = {};
  for (const c of creatures) {
    creaturesById[c.id] = { ...c };
  }

  const newEvents = [];
  const newCreatures = []; // Naissances
  const killsBySpecies = {}; // { speciesId: count }

  const MAX_POP_PER_SPECIES = parseInt(process.env.MAX_POP_PER_SPECIES || '300'); // Plafond configurable via .env

  for (const [speciesId, { action, context }] of Object.entries(actionsBySpecies)) {
    const sp = speciesMap[speciesId];
    if (!sp) continue;
    const stats = sp.stats || {};
    const params = sp.params || {};
    const vitesse = stats.vitesse_deplacement || 1;

    // Appliquer l'action à chaque créature de cette espèce
    const speciesCreatures = Object.values(creaturesById)
      .filter(c => c.species_id === parseInt(speciesId) && c.status === 'alive');

    // Index des proies potentielles (espèces que cette espèce peut chasser)
    // Permet à chaque créature de chasser individuellement dans sa propre zone
    const myRegime = params.regime || 'omnivore';
    const preySpeciesIds = new Set(
      Object.values(speciesMap)
        .filter(s => {
          const sr = (s.params || {}).regime || 'omnivore';
          return (myRegime === 'carnivore' && sr === 'herbivore') ||
                 (myRegime === 'omnivore' && sr === 'herbivore') ||
                 (myRegime === 'insectivore' && sr === 'herbivore');
        })
        .map(s => s.id)
    );
    const allPrey = preySpeciesIds.size > 0
      ? Object.values(creaturesById).filter(c => c.status === 'alive' && preySpeciesIds.has(c.species_id))
      : [];

    // Compteur de naissances déjà générées ce tick pour cette espèce
    let birthsThisTick = newCreatures.filter(c => c.species_id === parseInt(speciesId)).length;

    // Centre de masse de l'espèce (comportement social)
    const centerX = Math.round(speciesCreatures.reduce((s, c) => s + c.x, 0) / speciesCreatures.length);
    const centerY = Math.round(speciesCreatures.reduce((s, c) => s + c.y, 0) / speciesCreatures.length);

    for (const creature of speciesCreatures) {
      creaturesById[creature.id]._params = params;

      // Tolérance climatique
      const biome = biomesMap[`${creature.x},${creature.y}`];
      const afterClimate = applyClimatePenalty(creaturesById[creature.id], biome, params);
      creaturesById[creature.id] = afterClimate;

      // Perte d'énergie passive (gestation = +2 d'énergie supplémentaire)
      const energyCost = stats.consommation_energie || 5;
      const isGestating = (creaturesById[creature.id].gestation_ticks || 0) > 0;
      const gestationDrain = isGestating ? 2 : 0;
      creaturesById[creature.id].energy = Math.max(0, creaturesById[creature.id].energy - Math.round(energyCost * 0.3) - gestationDrain);
      creaturesById[creature.id].age += 1;
      creaturesById[creature.id].last_action = null;

      // Incrémenter la pulsion reproductive (si pas en gestation)
      if (!isGestating) {
        const driveInc = Math.max(1, Math.round(100 / (stats.vitesse_reproduction || 15)));
        creaturesById[creature.id].repro_drive = Math.min(100, (creaturesById[creature.id].repro_drive || 0) + driveInc);
      }

      // Countdown gestation → naissance
      if (isGestating) {
        creaturesById[creature.id].gestation_ticks--;
        if (creaturesById[creature.id].gestation_ticks === 0) {
          const totalPop = speciesCreatures.length + birthsThisTick;
          if (totalPop < MAX_POP_PER_SPECIES) {
            const babies = reproduce(creaturesById[creature.id], stats, biomesMap);
            newCreatures.push(...babies);
            birthsThisTick += babies.length;
            newEvents.push({
              type: 'naissance',
              description: `${sp.nom} a donné naissance à ${babies.length} descendant(s) !`,
              species_ids: [parseInt(speciesId)],
              x: creature.x, y: creature.y,
            });
          }
        }
      }

      // Mort de vieillesse
      const maxAge = Math.round(200 - (params.taille || 5) * 10);
      if (creaturesById[creature.id].age > maxAge) {
        creaturesById[creature.id].status = 'cadavre';
        creaturesById[creature.id].died_at = new Date().toISOString();
        creaturesById[creature.id].died_at_tick = currentTick;
        continue;
      }

      // Mort par manque d'énergie/santé
      if (creaturesById[creature.id].energy <= 0) {
        creaturesById[creature.id].health = Math.max(0, creaturesById[creature.id].health - 10);
        if (creaturesById[creature.id].health <= 0) {
          creaturesById[creature.id].status = 'cadavre';
          creaturesById[creature.id].died_at = new Date().toISOString();
          creaturesById[creature.id].died_at_tick = currentTick;
        }
        continue;
      }

      // Exécuter l'action (les créatures en gestation se reposent)
      const dirs = Object.values(DIRECTIONS);
      const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
      const effectiveAction = isGestating ? 'DORMIR' : action;

      switch (effectiveAction) {
        case 'SE_DEPLACER':
        case 'EXPLORER': {
          let moveDir = randomDir;

          // Chasse opportuniste : carnivores/omnivores attaquent les proies visibles même en explorant
          if (['carnivore', 'omnivore', 'insectivore'].includes(myRegime) && allPrey.length > 0) {
            const myDetection = stats.portee_detection || 5;
            const preyFound = allPrey.find(p => creaturesById[p.id]?.status === 'alive' && distance(creature, p) <= myDetection);
            if (preyFound && creaturesById[preyFound.id]) {
              const preyStats = (speciesMap[preyFound.species_id] || {}).stats || {};
              const result = resolveCombat(creaturesById[creature.id], creaturesById[preyFound.id], stats, preyStats);
              creaturesById[creature.id] = { ...creaturesById[creature.id], ...result.attacker };
              creaturesById[preyFound.id] = { ...creaturesById[preyFound.id], ...result.target };
              if (result.targetDied) {
                creaturesById[preyFound.id].died_at_tick = currentTick;
                if (!killsBySpecies[parseInt(speciesId)]) killsBySpecies[parseInt(speciesId)] = 0;
                killsBySpecies[parseInt(speciesId)]++;
              } else {
                // Proie blessée → énergie partielle (effort de chasse)
                creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 10);
              }
              break; // pas de déplacement ce tick
            }
          }

          // Comportement social : orienter le mouvement selon le type social
          const social = params.social || 'solitaire';
          if (social === 'grande_colonie' && speciesCreatures.length > 5) {
            const distToCenter = Math.abs(creature.x - centerX) + Math.abs(creature.y - centerY);
            if (distToCenter > 25) {
              // Trop loin du groupe → converger vers le centre de masse
              const dx = centerX > creature.x ? 1 : centerX < creature.x ? -1 : randomDir.dx;
              const dy = centerY > creature.y ? 1 : centerY < creature.y ? -1 : randomDir.dy;
              moveDir = { dx, dy };
            }
          } else if (social === 'solitaire' && speciesCreatures.length > 5) {
            const distToCenter = Math.abs(creature.x - centerX) + Math.abs(creature.y - centerY);
            if (distToCenter < 20) {
              // Trop près du centre → s'éloigner du groupe
              const dx = creature.x >= centerX ? 1 : -1;
              const dy = creature.y >= centerY ? 1 : -1;
              moveDir = { dx, dy };
            }
          }

          for (let step = 0; step < vitesse; step++) {
            const updated = applyMove(creaturesById[creature.id], moveDir.dx, moveDir.dy, biomesMap);
            creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
          }
          break;
        }

        case 'FUIR': {
          const threat = (context.nearbyThreatList || [])[0];
          let fx = randomDir.dx, fy = randomDir.dy;
          if (threat) {
            fx = creature.x > threat.x ? 1 : (creature.x < threat.x ? -1 : randomDir.dx);
            fy = creature.y > threat.y ? 1 : (creature.y < threat.y ? -1 : randomDir.dy);
          }
          for (let step = 0; step < vitesse + 1; step++) {
            const updated = applyMove(creaturesById[creature.id], fx, fy, biomesMap);
            creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
          }
          break;
        }

        case 'MANGER': {
          const curBiome = biomesMap[`${creature.x},${creature.y}`];
          if (curBiome && curBiome.food_level > 10) {
            creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 30);
            creaturesById[creature.id].last_action = 'MANGER'; // Marquer pour worldUpdater
          } else {
            // Pas de nourriture ici → se déplacer pour en chercher
            const updated = applyMove(creaturesById[creature.id], randomDir.dx, randomDir.dy, biomesMap);
            creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
          }
          break;
        }

        case 'CHASSER':
        case 'ATTAQUER': {
          // Chasse individuelle : chaque prédateur cherche dans sa propre zone de détection
          const myDetection = stats.portee_detection || 5;
          const prey = allPrey.find(p => creaturesById[p.id]?.status === 'alive' && distance(creature, p) <= myDetection)
            || (context.nearbyPreyList || []).find(p => creaturesById[p.id]?.status === 'alive');
          if (prey && creaturesById[prey.id]) {
            const preyStats = (speciesMap[prey.species_id] || {}).stats || {};
            const result = resolveCombat(creaturesById[creature.id], creaturesById[prey.id], stats, preyStats);
            creaturesById[creature.id] = { ...creaturesById[creature.id], ...result.attacker };
            creaturesById[prey.id] = { ...creaturesById[prey.id], ...result.target };

            if (result.targetDied) {
              creaturesById[prey.id].died_at_tick = currentTick;
              const preySp = speciesMap[prey.species_id];
              // Comptabiliser le kill
              if (!killsBySpecies[parseInt(speciesId)]) killsBySpecies[parseInt(speciesId)] = 0;
              killsBySpecies[parseInt(speciesId)]++;

              newEvents.push({
                type: 'combat',
                description: `${sp.nom} a chassé et tué un ${preySp ? preySp.nom : 'inconnu'} !`,
                species_ids: [parseInt(speciesId), prey.species_id],
                x: creature.x,
                y: creature.y,
              });
            } else {
              // Proie blessée mais vivante → énergie partielle (sang)
              creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 10);
            }
          } else {
            // Manger un cadavre si charognard
            const cadavre = (context.nearbyCadavreList || [])[0];
            if (cadavre && creaturesById[cadavre.id] && params.regime === 'charognard') {
              creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 20);
              creaturesById[cadavre.id].status = 'dead'; // Consommé, retirer immédiatement
            } else {
              const updated = applyMove(creaturesById[creature.id], randomDir.dx, randomDir.dy, biomesMap);
              creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
            }
          }
          break;
        }

        case 'SE_REPRODUIRE': {
          // Conditions : pulsion >= 80, partenaire adjacent prêt, pas déjà en gestation
          const myDrive = creaturesById[creature.id].repro_drive || 0;
          if (myDrive < 80 || isGestating) break;

          const adjacentMate = speciesCreatures.find(c =>
            c.id !== creature.id &&
            (creaturesById[c.id]?.repro_drive || 0) >= 80 &&
            creaturesById[c.id]?.status === 'alive' &&
            (creaturesById[c.id]?.gestation_ticks || 0) === 0 &&
            distance(creaturesById[creature.id], creaturesById[c.id]) <= 2
          );

          if (adjacentMate && creaturesById[adjacentMate.id]) {
            // Démarrer la gestation sur cette créature
            const gestTicks = gestationDuration(params.taille || 5);
            creaturesById[creature.id].gestation_ticks = gestTicks;
            creaturesById[creature.id].repro_drive = 0;
            creaturesById[creature.id].energy = Math.max(10, creaturesById[creature.id].energy - 20);
            creaturesById[creature.id].last_reproduced_at = currentTick;
            // Partenaire reset également
            creaturesById[adjacentMate.id].repro_drive = 0;

            newEvents.push({
              type: 'naissance',
              description: `${sp.nom} a commencé une gestation (${gestTicks} ticks) !`,
              species_ids: [parseInt(speciesId)],
              x: creature.x, y: creature.y,
            });
          }
          break;
        }

        case 'CHERCHER_PARTENAIRE': {
          // Se diriger vers le congénère prêt le plus proche
          const readyMate = speciesCreatures
            .filter(c => c.id !== creature.id && (creaturesById[c.id]?.repro_drive || 0) >= 80 && creaturesById[c.id]?.status === 'alive')
            .sort((a, b) => distance(creaturesById[creature.id], a) - distance(creaturesById[creature.id], b))[0];

          let cpDir = randomDir;
          if (readyMate) {
            const tx = readyMate.x, ty = readyMate.y;
            cpDir = {
              dx: tx > creature.x ? 1 : tx < creature.x ? -1 : 0,
              dy: ty > creature.y ? 1 : ty < creature.y ? -1 : 0,
            };
          }
          for (let step = 0; step < vitesse; step++) {
            const updated = applyMove(creaturesById[creature.id], cpDir.dx, cpDir.dy, biomesMap);
            creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
          }
          break;
        }

        case 'PROTEGER_PETITS': {
          const isPetit = creaturesById[creature.id].age < 10;
          if (isPetit) {
            // Les petits fuient loin des menaces (protégés par les adultes)
            const threat = Object.values(creaturesById).find(c =>
              c.status === 'alive' && c.species_id !== creature.species_id && distance(creature, c) <= 6
            );
            let fx = randomDir.dx, fy = randomDir.dy;
            if (threat) {
              fx = creature.x > threat.x ? 1 : creature.x < threat.x ? -1 : randomDir.dx;
              fy = creature.y > threat.y ? 1 : creature.y < threat.y ? -1 : randomDir.dy;
            }
            for (let step = 0; step < vitesse + 1; step++) {
              const updated = applyMove(creaturesById[creature.id], fx, fy, biomesMap);
              creaturesById[creature.id] = { ...creaturesById[creature.id], x: updated.x, y: updated.y };
            }
          } else {
            // Le parent reste sur place et absorbe les dégâts des menaces proches
            const threats = Object.values(creaturesById).filter(c =>
              c.status === 'alive' && c.species_id !== creature.species_id && distance(creature, c) <= 3
            );
            if (threats.length > 0) {
              const totalDmg = threats.reduce((sum, t) => {
                const tStats = (speciesMap[t.species_id] || {}).stats || {};
                return sum + Math.round((tStats.degats || 10) * (0.4 + Math.random() * 0.3));
              }, 0);
              creaturesById[creature.id].health = Math.max(0, creaturesById[creature.id].health - totalDmg);
              if (creaturesById[creature.id].health <= 0) {
                creaturesById[creature.id].status = 'cadavre';
                creaturesById[creature.id].died_at = new Date().toISOString();
                creaturesById[creature.id].died_at_tick = currentTick;
              }
            }
          }
          break;
        }

        case 'BOIRE': {
          const curBiomeW = biomesMap[`${creature.x},${creature.y}`];
          if (curBiomeW && curBiomeW.water_level > 10) {
            creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 15);
            creaturesById[creature.id].health = Math.min(100, creaturesById[creature.id].health + 5);
          }
          break;
        }

        case 'DORMIR': {
          creaturesById[creature.id].energy = Math.min(100, creaturesById[creature.id].energy + 15);
          creaturesById[creature.id].health = Math.min(100, creaturesById[creature.id].health + 5);
          break;
        }

        case 'DEFENDRE_TERRITOIRE': {
          // Attaque le premier intrus proche (espèce différente)
          const intruder = Object.values(creaturesById).find(c =>
            c.id !== creature.id &&
            c.status === 'alive' &&
            c.species_id !== creature.species_id &&
            distance(creature, c) <= 2
          );
          if (intruder) {
            const intruderStats = (speciesMap[intruder.species_id] || {}).stats || {};
            const result = resolveCombat(creaturesById[creature.id], creaturesById[intruder.id], stats, intruderStats);
            creaturesById[creature.id] = { ...creaturesById[creature.id], ...result.attacker };
            creaturesById[intruder.id] = { ...creaturesById[intruder.id], ...result.target };
            if (result.targetDied) {
              creaturesById[intruder.id].died_at_tick = currentTick;
              if (!killsBySpecies[parseInt(speciesId)]) killsBySpecies[parseInt(speciesId)] = 0;
              killsBySpecies[parseInt(speciesId)]++;
            }
          }
          break;
        }

        case 'SE_CACHER':
        case 'RIEN':
        default:
          break;
      }
    }
  }

  const finalCreatures = Object.values(creaturesById);
  return { creatures: finalCreatures, newCreatures, newEvents, killsBySpecies };
}

module.exports = { buildContext, resolveActions };
