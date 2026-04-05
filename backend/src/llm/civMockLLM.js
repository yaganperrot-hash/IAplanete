// Mock LLM civilisations — format libre : STRATÉGIE + EFFETS parsables

// Noms de structures par catégorie et niveau technologique
const STRUCT_NAMES = {
  agriculture: {
    p: ['champ de blé', 'potager collectif', 'terrain cultivé'],
    m: ['ferme organisée', 'domaine agricole', 'champs irrigués'],
    a: ['exploitation agricole', 'domaine maraîcher'],
  },
  bois: {
    p: ['camp de bûcherons', 'zone de coupe'],
    m: ['scierie rudimentaire', 'atelier de bois'],
    a: ['scierie mécanisée', 'chantier forestier'],
  },
  militaire: {
    p: ["terrain d'entraînement", "enclos de combat"],
    m: ['camp militaire', 'caserne'],
    a: ['académie militaire', 'garnison fortifiée'],
  },
  defense: {
    p: ['palissade de bois', 'fossé défensif'],
    m: ['muraille de pierre', 'rempart'],
    a: ['fortification avancée', 'citadelle'],
  },
  commerce: {
    p: ["marché du village", "zone d'échange"],
    m: ['comptoir commercial', 'marché couvert'],
    a: ['bourse marchande', 'grand marché'],
  },
  religieux: {
    p: ['lieu de culte', 'cercle de pierres'],
    m: ['temple', 'sanctuaire'],
    a: ['grande cathédrale', 'complexe religieux'],
  },
  maritime: {
    p: ['ponton de pêche', 'embarcadère'],
    m: ['port de pêche', 'quai'],
    a: ['port maritime', 'chantier naval'],
  },
  surveillance: {
    p: ['poste de guet', "arbre d'observation"],
    m: ['tour de guet', 'vigie'],
    a: ["réseau d'éclaireurs", "tour d'observation"],
  },
};

const PROD_LABELS = {
  agriculture: 'nourriture', bois: 'matériaux', militaire: 'guerriers',
  defense: 'protection', commerce: 'matériaux', religieux: 'moral',
  maritime: 'nourriture', surveillance: 'visibilité', extraction: 'matériaux',
  production: 'matériaux', savoir: 'culture', autre: 'divers',
};

const BUILD_COSTS = {
  agriculture: 20, bois: 15, militaire: 20, defense: 40,
  commerce: 25, religieux: 20, maritime: 25, surveillance: 10,
  extraction: 20, production: 20, savoir: 25, autre: 15,
};
const BUILD_TICKS = {
  agriculture: 5, bois: 3, militaire: 5, defense: 10,
  commerce: 5, religieux: 6, maritime: 6, surveillance: 2,
  extraction: 4, production: 4, savoir: 5, autre: 3,
};
const BUILD_WORKERS = {
  agriculture: 10, bois: 8, militaire: 10, defense: 20,
  commerce: 10, religieux: 8, maritime: 12, surveillance: 5,
  extraction: 10, production: 8, savoir: 8, autre: 8,
};

function techTier(age) {
  if (['primitif', 'neolithique'].includes(age)) return 'p';
  if (['bronze', 'fer', 'classique'].includes(age)) return 'm';
  return 'a';
}

function pickName(category, age) {
  const tier = techTier(age);
  const list = STRUCT_NAMES[category]?.[tier] || STRUCT_NAMES[category]?.p || ['structure'];
  return list[Math.floor(Math.random() * list.length)];
}

function fmt(stratText, lines) {
  const effetsText = lines.join('\n');
  // Extraire les verbes pour le log
  const actions = lines.map(l => { const m = l.match(/^-\s+([\wÀ-ÿ]+)/); return m ? m[1] : 'RIEN'; });
  return { strategie: stratText, effets_text: effetsText, actions, raison: stratText };
}

function decide(context) {
  const {
    nom, valeurs = [], gouvernement = 'monarchie',
    age_tech = 'primitif', population = 100,
    moral = 70, food_status = 'stable', materials_level = 50,
    military_power = 10, territory_count = 10,
    neighbors = [], active_processes = [],
    has_coastal = false,
    free_workforce = 60,
    structures = [],
  } = context;

  const warlike   = valeurs.includes('guerre') || valeurs.includes('expansion');
  const peaceful  = valeurs.includes('commerce') || valeurs.includes('connaissance') || valeurs.includes('isolationnisme');
  const spiritual = valeurs.includes('spiritualite') || valeurs.includes('art_culture');
  const canAttack = !['primitif', 'neolithique'].includes(age_tech);
  const hasConstruction = active_processes.some(p => p.type === 'construction');
  const hasCategory  = (cat) => structures.some(s => s.category === cat);
  const workersIn    = (cat) => structures.filter(s => s.category === cat).reduce((s, b) => s + (b.workers || 0), 0);

  const famine     = food_status === 'famine';
  const deficit    = food_status === 'deficit';
  const underAttack = neighbors.some(n => n.relation === 'guerre');
  const rand = Math.random();
  const effects = [];

  // ─── NIVEAU 1 : SURVIE ───────────────────────────────────────────────────
  if (underAttack && military_power < 20) {
    const w = Math.min(50, free_workforce);
    const strat = `Un ennemi menace nos frontières. Nous mobilisons toutes nos forces. La survie de ${nom} prime sur tout.`;
    if (w > 0)
      effects.push(`- AFFECTER ${w} personnes → défense des remparts (ressources: aucune, durée: permanent, production: défense)`);
    if (materials_level >= BUILD_COSTS.defense && free_workforce >= 20 && !hasConstruction) {
      const sn = pickName('defense', age_tech);
      const cw = Math.min(BUILD_WORKERS.defense, free_workforce - w);
      effects.push(`- CRÉER ${sn} (ressources: ${BUILD_COSTS.defense} matériaux, personnes: ${cw}, durée: ${BUILD_TICKS.defense} ticks)`);
    }
    return fmt(strat, effects.length ? effects : ['- RIEN']);
  }

  if (famine) {
    const strat = `La famine ravage notre peuple. Nous devons agir immédiatement pour nourrir ${nom}.`;
    const add = Math.min(Math.max(0, 40 - workersIn('agriculture')), free_workforce);
    if (add > 0)
      effects.push(`- AFFECTER ${add} personnes → culture intensive des champs (ressources: aucune, durée: permanent, production: nourriture)`);
    const surplus = structures.filter(s => s.category === 'surveillance' && s.workers > 0);
    if (surplus.length > 0)
      effects.push(`- MODIFIER ${surplus[0].name} → réduction des effectifs en faveur de l'agriculture`);
    return fmt(strat, effects.length ? effects : ['- RIEN']);
  }

  // ─── NIVEAU 2 : NOURRITURE ───────────────────────────────────────────────
  if (deficit || workersIn('agriculture') < 15) {
    const farmW = Math.min(30, free_workforce);
    if (farmW > 0) {
      if (!hasCategory('agriculture') && materials_level >= BUILD_COSTS.agriculture && !hasConstruction) {
        const sn = pickName('agriculture', age_tech);
        const cw = Math.min(BUILD_WORKERS.agriculture, free_workforce);
        const strat = `La production alimentaire est insuffisante. Nous construisons ${sn} et affectons des bras aux champs.`;
        effects.push(`- CRÉER ${sn} (ressources: ${BUILD_COSTS.agriculture} matériaux, personnes: ${cw}, durée: ${BUILD_TICKS.agriculture} ticks)`);
        effects.push(`- AFFECTER ${farmW} personnes → culture des champs (ressources: aucune, durée: permanent, production: nourriture)`);
      } else {
        const strat = `Nos réserves alimentaires s'amenuisent. Davantage de bras aux champs.`;
        effects.push(`- AFFECTER ${farmW} personnes → culture des champs (ressources: aucune, durée: permanent, production: nourriture)`);
        return fmt(strat, effects);
      }
      return fmt(effects[0].includes('CRÉER')
        ? `La production alimentaire est insuffisante. Nous construisons et affectons des bras aux champs.`
        : `Nos réserves alimentaires s'amenuisent.`, effects);
    }
  }

  // ─── NIVEAU 3 : STABILITÉ ────────────────────────────────────────────────
  if (moral < 40 && materials_level >= 5) {
    const fw = Math.min(10, free_workforce);
    const strat = `Le moral du peuple est bas. Nous organisons des festivités pour redonner espoir à ${nom}.`;
    if (fw > 0)
      effects.push(`- AFFECTER ${fw} personnes → organisation de festivités (ressources: 5 matériaux, durée: 2 ticks, production: moral)`);
    return fmt(strat, effects.length ? effects : ['- RIEN']);
  }

  // ─── NIVEAU 4 : DÉVELOPPEMENT ────────────────────────────────────────────
  // Structures sans travailleurs → affecter
  const emptyActive = structures.filter(s => s.status === 'active' && (s.workers || 0) === 0);
  if (emptyActive.length > 0 && free_workforce > 0) {
    const s = emptyActive[0];
    const w = Math.min(BUILD_WORKERS[s.category] || 10, free_workforce);
    const strat = `Notre ${s.name} est vide. Nous y affectons des travailleurs pour la rendre productive.`;
    effects.push(`- AFFECTER ${w} personnes → ${s.name} (ressources: aucune, durée: permanent, production: ${PROD_LABELS[s.category] || 'divers'})`);
    return fmt(strat, effects);
  }

  // Construction si possible
  if (!hasConstruction && rand < 0.7) {
    let buildCat = null, buildReason = '';
    if (!hasCategory('bois') && materials_level >= BUILD_COSTS.bois) {
      buildCat = 'bois'; buildReason = 'Nous avons besoin de bois pour nos constructions futures.';
    } else if (!hasCategory('militaire') && canAttack && materials_level >= BUILD_COSTS.militaire) {
      buildCat = 'militaire'; buildReason = "Il est temps d'entraîner des guerriers.";
    } else if (!hasCategory('commerce') && !['primitif'].includes(age_tech) && materials_level >= BUILD_COSTS.commerce) {
      buildCat = 'commerce'; buildReason = 'Le commerce enrichira notre civilisation.';
    } else if (!hasCategory('religieux') && spiritual && materials_level >= BUILD_COSTS.religieux) {
      buildCat = 'religieux'; buildReason = 'Notre peuple a besoin d\'un lieu de recueillement.';
    } else if (!hasCategory('defense') && (warlike || underAttack) && canAttack && materials_level >= BUILD_COSTS.defense) {
      buildCat = 'defense'; buildReason = 'Nos frontières doivent être protégées.';
    } else if (!hasCategory('maritime') && has_coastal && !['primitif', 'neolithique'].includes(age_tech) && materials_level >= BUILD_COSTS.maritime) {
      buildCat = 'maritime'; buildReason = 'La mer nous offre richesses et routes.';
    } else if (!hasCategory('surveillance') && territory_count >= 20 && materials_level >= BUILD_COSTS.surveillance) {
      buildCat = 'surveillance'; buildReason = 'Nous devons surveiller nos frontières.';
    }

    if (buildCat) {
      const sn  = pickName(buildCat, age_tech);
      const cw  = Math.min(BUILD_WORKERS[buildCat], free_workforce);
      const strat = `${buildReason} Nous lançons la construction de ${sn}.`;
      effects.push(`- CRÉER ${sn} (ressources: ${BUILD_COSTS[buildCat]} matériaux, personnes: ${cw}, durée: ${BUILD_TICKS[buildCat]} ticks)`);
      // Affecter les restants à la récolte de bois si utile
      const extra = Math.min(15, free_workforce - cw);
      if (extra > 0 && buildCat !== 'bois' && !hasCategory('bois'))
        effects.push(`- AFFECTER ${extra} personnes → coupe de bois (ressources: aucune, durée: permanent, production: matériaux)`);
      return fmt(strat, effects);
    }
  }

  // Explorer
  if (territory_count < 30 + population * 0.1 && free_workforce >= 5 && rand < 0.6) {
    const dirs = ['nord', 'sud', 'est', 'ouest', 'nord-est', 'sud-ouest'];
    const dir  = dirs[Math.floor(Math.random() * dirs.length)];
    const strat = `De nouveaux territoires nous attendent. Nous envoyons des éclaireurs vers le ${dir}.`;
    effects.push(`- ENVOYER 5 personnes → exploration ${dir} (durée: 3 ticks, risque: faible)`);
    const extra = Math.min(15, free_workforce - 5);
    if (extra > 0 && !hasCategory('bois'))
      effects.push(`- AFFECTER ${extra} personnes → coupe de bois (ressources: aucune, durée: permanent, production: matériaux)`);
    return fmt(strat, effects);
  }

  // ─── NIVEAU 5 : RAYONNEMENT ──────────────────────────────────────────────
  if (canAttack && warlike && !peaceful) {
    const weak = neighbors.find(n => n.relation !== 'alliance' && n.military_power < military_power * 1.3 && n.relation !== 'guerre');
    if (weak && rand < 0.4)
      return fmt(`${weak.nom} est à notre portée. Nos guerriers marchent sur eux.`,
        [`- DIPLOMATIE guerre → ${weak.nom}`]);
  }
  if (peaceful && rand < 0.3) {
    const ally = neighbors.find(n => n.relation === 'neutre');
    if (ally)
      return fmt(`Une alliance avec ${ally.nom} renforcera notre sécurité.`,
        [`- DIPLOMATIE proposer_alliance → ${ally.nom}`]);
  }
  if (valeurs.includes('commerce') && rand < 0.4) {
    const trade = neighbors.find(n => n.relation !== 'guerre');
    if (trade)
      return fmt(`Nous proposons une route commerciale avec ${trade.nom}.`,
        [`- DIPLOMATIE proposer_commerce → ${trade.nom}`]);
  }
  if (valeurs.includes('expansion') && population > 150 && materials_level >= 60 && free_workforce >= 30 && rand < 0.3) {
    return fmt(`Notre peuple est prêt à s'étendre. Nous fondons une nouvelle colonie.`,
      [`- ENVOYER 30 personnes → fondation de colonie au nord (durée: 5 ticks, risque: moyen)`]);
  }

  // ─── Fallback ─────────────────────────────────────────────────────────────
  const strat = `Nous consolidons notre position. ${nom} grandit sereinement, préparant l'avenir.`;
  if (free_workforce > 20 && hasCategory('agriculture')) {
    const w = Math.min(15, free_workforce);
    effects.push(`- AFFECTER ${w} personnes → culture des champs (ressources: aucune, durée: permanent, production: nourriture)`);
  } else {
    effects.push('- RIEN');
  }
  return fmt(strat, effects);
}

module.exports = { decide };
