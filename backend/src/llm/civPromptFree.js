// civPromptFree.js — Nouvelle architecture prompt libre + parseur LLM
// Remplace entièrement le système V0-V9 (civPromptVariants.js).
// À implémenter par Deepseek. Ne pas modifier sans discussion.

'use strict';

const parseJ = (v, fb) => {
  try {
    return JSON.parse(v != null ? v : JSON.stringify(fb));
  } catch {
    return fb;
  }
};

// Configuration par civ (objet CIV_VOICES)
const CIV_VOICES = {
  'Les Conquérants du Feu Sacré': {
    tension: "que la force seule décide, une fois pour toutes",
    voix: "Tu parles avec la conviction d'un chef qui croit que la guerre est la volonté des dieux."
  },
  'Les Nomades du Fer': {
    tension: "ne plus jamais avoir à compter les réserves",
    voix: "Tu parles peu. Chaque mot est une décision. Pas de poésie."
  },
  'Les Enfants de la Terre Mère': {
    tension: "trouver un sens là où il n'y en a peut-être aucun",
    voix: "Tu parles de ta terre comme d'un être vivant. Lent, profond, ancré."
  },
  "Les Marchands de l'Aube": {
    tension: "être reconnu par ceux qui refusent de traiter",
    voix: "Tu calcules. Chaque situation est une opportunité ou un risque à chiffrer."
  },
  'Les Gardiens du Mur': {
    tension: "que tout soit à sa place et que rien ne déraille",
    voix: "Tu parles comme un commandant. Précis, court, orienté sécurité."
  },
  'Le Grand Khaganat': {
    tension: "posséder davantage pour ne plus jamais manquer",
    voix: "Tu parles comme un empire en marche. Destinée, dominion, ordre."
  },
  'Le Syndicat des Forges': {
    tension: "comprendre ce qu'aucun autre ne comprend",
    voix: "Tu parles en termes de production, d'efficacité, de maîtrise technique."
  },
  "Les Érudits d'Aristos": {
    tension: "créer quelque chose qui survive aux guerres et au temps",
    voix: "Tu questionnes autant que tu décides. Le doute est une forme de sagesse."
  },
  'Les Ascètes de la Pierre': {
    tension: "être laissé en paix, définitivement",
    voix: "Tu parles peu et pèses chaque mot. Le silence est aussi une décision."
  },
  'Les Mystiques des Brumes': {
    tension: "agir sans jamais avoir à se justifier",
    voix: "Tu vois des signes dans les événements. Tes décisions ont une dimension prophétique."
  },
  "Les Marchands de la Route d'Or": {
    tension: "ouvrir une route que personne n'a encore osé emprunter",
    voix: "Tu penses en caravanes, en saisons, en profits différés. Le risque calculé est ton art."
  },
  'La Cité des Sages': {
    tension: "transmettre quelque chose qui survive à ta propre mort",
    voix: "Tu peses chaque décision à l'aune de ce qu'elle laissera aux générations futures."
  },
  'Les Chasseurs du Vent': {
    tension: "ne jamais s'arrêter assez longtemps pour être rattrapé",
    voix: "Tu parles en distances, en pistes, en saisons. L'horizon est toujours la bonne direction."
  },
  "L'Empire des Forges": {
    tension: "maîtriser ce que les autres subissent",
    voix: "Tu penses en matériaux, en procédés, en solutions. Chaque problème a une réponse technique."
  },
  'Les Pillards de la Côte': {
    tension: "prendre avant d'être pris",
    voix: "Tu parles vite, tu décides plus vite encore. La lenteur est une forme de mort."
  },
};

// Helpers de contexte narratif

/**
 * Génère une description narrative de ce que la civ sait faire.
 * Basée sur ctx.structures (filtrés par rôle savoir/production/extraction/art)
 * et ctx.reliques_used (reliques dont used=1).
 */
function describeTechnology(ctx) {
  const structures = ctx.structures || [];
  const reliquesUsed = ctx.reliques_used || [];

  // Filtrer structures par rôle (simplifié)
  const savoir = structures.filter(s => s.role === 'savoir' || s.production === 'savoir');
  const production = structures.filter(s => s.role === 'production' || s.production === 'production');
  const extraction = structures.filter(s => s.role && (s.role.includes('mine') || s.role === 'extraction'));
  const art = structures.filter(s => s.role === 'art' || s.production === 'art');

  const parts = [];

  if (savoir.length > 0) {
    const names = savoir.map(s => s.name).join(', ');
    parts.push(`Tes érudits maîtrisent ${names}.`);
  }
  if (production.length > 0) {
    const names = production.map(s => s.name).join(', ');
    parts.push(`Tes artisans savent fabriquer ${names}.`);
  }
  if (extraction.length > 0) {
    const names = extraction.map(s => s.name).join(', ');
    parts.push(`Tes mineurs extraient ${names}.`);
  }
  if (art.length > 0) {
    const names = art.map(s => s.name).join(', ');
    parts.push(`Tes artistes créent ${names}.`);
  }

  // Ajouter les reliques utilisées
  if (reliquesUsed.length > 0) {
    const relicNames = reliquesUsed.map(r => r.name).join(', ');
    parts.push(`Grâce à ${relicNames}, tes techniques sont améliorées.`);
  }

  if (parts.length === 0) {
    return "Ton peuple construit à la main. Aucune technique particulière n'a encore été maîtrisée.";
  }

  return parts.join(' ');
}

/**
 * Génère la section reliques en possession non utilisées (taken=1, used=0).
 */
function describeReliquesMysterieuses(ctx) {
  const reliquesMystere = ctx.reliques_mystere || [];
  if (reliquesMystere.length === 0) {
    return null;
  }

  const lines = reliquesMystere.map(r => {
    const monthsAgo = r.discovered_at_tick ? Math.floor((ctx.tick || 0) - r.discovered_at_tick) : 'quelques';
    return `— ${r.name} repose dans ton temple depuis ${monthsAgo} mois. Tes prêtres se disputent sur sa signification.`;
  });

  return lines.join('\n');
}

/**
 * Retourne les dernières entrées de mémoire (identite, savoir, histoire, diplomatie, pressions).
 */
function getMemoryShort(ctx) {
  const m = parseJ(ctx.civ_memory, {});
  const lines = [];
  if (m.identite?.length)   lines.push(`Identité : ${m.identite[m.identite.length - 1]}`);
  if (m.savoir?.length)     lines.push(`Savoir : ${m.savoir[m.savoir.length - 1]}`);
  if (m.histoire?.length)   lines.push(`Histoire : ${m.histoire[m.histoire.length - 1]}`);
  if (m.diplomatie?.length) lines.push(`Diplomatie : ${m.diplomatie[m.diplomatie.length - 1]}`);
  if (m.pressions?.length)  lines.push(`Pression : ${m.pressions[m.pressions.length - 1]}`);
  return lines.join('\n') || '(aucune mémoire)';
}

/**
 * Génère la section des échecs du tick précédent avec leur raison.
 */
function buildEchecsNarratif(echecs) {
  if (!echecs || echecs.length === 0) {
    return '';
  }

  const lines = echecs.map(e => {
    switch (e.raison) {
      case 'population_insuffisante':
        return `Tu voulais ${e.intention}. Impossible : ton peuple ne compte que ${e.population_dispo} âmes disponibles.`;
      case 'ressource_manquante':
        return `Tu voulais ${e.intention}. Il manquait ${e.ressource_manquante} (besoin : ${e.besoin}, disponible : ${e.dispo}).`;
      case 'main_oeuvre_nulle':
        return `Tu voulais ${e.intention}. Personne n'a été affecté à cette tâche.`;
      case 'cible_inconnue':
        return `Tu voulais ${e.intention}. Tes émissaires n'ont trouvé aucune trace de '${e.cible}'.`;
      default:
        return `Tu voulais ${e.intention}. Cela n'a pas pu se faire ce mois-ci.`;
    }
  });

  return lines.join('\n');
}

/**
 * Transforme les urgences mécaniques en phrases dramatiques.
 */
function buildUrgencesNarratives(ctx) {
  const urgentLines = [];

  if ((ctx.homeless_deaths || 0) > 0) {
    urgentLines.push(`${ctx.homeless_deaths} personnes sont mortes de froid cette nuit. Pas métaphoriquement.`);
  }

  const famineIn = ctx.food_famine_in;
  if (famineIn != null && famineIn < 5) {
    urgentLines.push(`Dans ${famineIn} mois tes greniers sont vides. Ton peuple le sait déjà.`);
  } else if (famineIn != null && famineIn < 10) {
    urgentLines.push(`Les réserves s'amenuisent. Dans ${famineIn} mois il faudra choisir qui mange.`);
  }

  if ((ctx.moral || 0) < 20) {
    urgentLines.push(`Le moral est en chute libre. Des gens commencent à partir.`);
  }

  if ((ctx.homeless || 0) > 0) {
    urgentLines.push(`${ctx.homeless} personnes dorment dehors ce soir.`);
  }

  if (urgentLines.length === 0) {
    return "Rien d'urgent. Le calme peut être une chance ou un piège.";
  }

  return urgentLines.join('\n');
}

/**
 * Traduit ctx.resourceBilan en 2-3 phrases qualitatives (pas de chiffres bruts).
 */
function describeResourcesNarrative(ctx) {
  const rb = ctx.resourceBilan || {};
  const lines = [];

  const nourriture = rb.nourriture || {};
  if (nourriture.balance > 0) {
    lines.push("Les greniers sont bien fournis.");
  } else if (nourriture.balance < 0) {
    lines.push("La nourriture diminue mois après mois.");
  }

  const bois = rb.bois || {};
  if (bois.stock <= 0) {
    lines.push("Le bois manque pour toute nouvelle construction.");
  } else if (bois.stock > 0) {
    lines.push("Vos forêts fournissent assez de bois.");
  }

  const fer = rb.fer || {};
  if (fer.stock > 0) {
    lines.push("Vos forges ont du métal à travailler.");
  }

  if (lines.length === 0) {
    lines.push("Les ressources sont stables, ni abondantes ni critiques.");
  }

  return lines.join(' ');
}

/**
 * Traduit ctx.neighbors en descriptions qualitatives.
 */
function describeNeighborsNarrative(ctx) {
  const neighbors = ctx.neighbors || [];
  if (neighbors.length === 0) {
    return "Aucune autre civilisation n'a encore été rencontrée. Sommes-nous seuls ?";
  }

  const lines = neighbors.map(n => {
    switch (n.relation) {
      case 'guerre':
        return `Les ${n.nom} sont en guerre contre vous. Ils ont ${n.military_power} soldats.`;
      case 'commerce':
        return `Vous échangez régulièrement avec les ${n.nom}.`;
      case 'neutre':
        return `Les ${n.nom} existent. Vous ne vous êtes pas encore parlé.`;
      default:
        return `Les ${n.nom} (relation: ${n.relation}).`;
    }
  });

  return lines.join('\n');
}

/**
 * Décrit la population (existant).
 */
function describePopulation(ctx) {
  // Utilisation du texte existant (getTextePopulation)
  // Pour l'instant, on produit une version simple.
  const pop = ctx.population || 0;
  const free = ctx.free_workforce || 0;
  const trend = ctx.population_trend || 'stable';
  const homeless = ctx.homeless || 0;

  let text = `${pop} habitants, ${free} disponibles pour de nouvelles tâches.`;
  if (homeless > 0) {
    text += ` ${homeless} personnes dorment dehors.`;
  }
  if (trend === 'croissance') {
    text += ' La population grandit.';
  } else if (trend === 'déclin') {
    text += ' La population diminue.';
  }
  return text;
}

/**
 * Décrit le territoire (à ajouter).
 */
function describeTerritory(ctx) {
  const count = ctx.territory_count || 0;
  return `${count} cases de territoire.`;
}

/**
 * Décrit l'armée (existant).
 */
function describeArmee(ctx) {
  const soldiers = ctx.army_soldiers || 0;
  const power = ctx.army_power || 0;
  if (soldiers === 0) {
    return "Aucune armée constituée.";
  }
  return `${soldiers} soldats, puissance ${power}.`;
}

/**
 * Fonction principale buildPromptFree
 */
function buildPromptFree(ctx) {
  const civName = ctx.nom;
  const voice = CIV_VOICES[civName] || { tension: '', voix: '' };

  const identite = `Tu es ${civName}, ${ctx.gouvernement}.
${ctx.description || ''}

Ce qui te définit depuis ta fondation : ${(ctx.valeurs || []).join(', ')}.
Ce que ton peuple porte sans se l'avouer : ${voice.tension}`;

  const voix = voice.voix;

  const temps = `${ctx.month_name}, An ${ctx.year} — ${ctx.season}`;

  const urgences = buildUrgencesNarratives(ctx);

  const realite = `TA RÉALITÉ :
${describeResourcesNarrative(ctx)}
${describePopulation(ctx)}
${describeTerritory(ctx)}
${describeArmee(ctx)}`;

  const technologie = describeTechnology(ctx);

  const reliquesMystere = describeReliquesMysterieuses(ctx);
  const reliquesSection = reliquesMystere
    ? `OBJETS EN TA POSSESSION DONT TU IGNORES ENCORE LE SENS :
${reliquesMystere}`
    : '';

  const evenements = ctx.last_consequences_narratif || '';

  const echecs = ctx.echecs_tick_precedent && ctx.echecs_tick_precedent.length > 0
    ? `CE QUI N'A PAS PU SE FAIRE — ET POURQUOI :
${buildEchecsNarratif(ctx.echecs_tick_precedent)}`
    : '';

  const memoire = getMemoryShort(ctx);

  const voisins = describeNeighborsNarrative(ctx);

  const instruction = `Tu prends des décisions pour les 30 prochains jours. Pas plus.
Parle à la première personne.
Raconte ce que tu décides, pourquoi, avec qui, avec quoi.
Sois précis sur ce que tu mets en mouvement.`;

  // Assemblage final
  const sections = [
    `[IDENTITÉ]\n${identite}`,
    `[VOIX]\n${voix}`,
    '---',
    `[TEMPS]\n${temps}`,
    `[URGENCES]\nCE QUE TU NE PEUX PAS IGNORER CE MOIS-CI :\n${urgences}`,
    `[RÉALITÉ]\n${realite}`,
    `CE QUE TON PEUPLE SAIT FAIRE :\n${technologie}`,
    reliquesMystere ? `[RELIQUES MYSTÉRIEUSES]\n${reliquesSection}` : '',
    `[ÉVÉNEMENTS]\nCE QUI VIENT DE SE PASSER :\n${evenements}`,
    echecs ? `[ÉCHECS]\n${echecs}` : '',
    `[MÉMOIRE]\nCE QUE TU N'OUBLIES PAS :\n${memoire}`,
    `[VOISINS]\nCE QUE TU SAIS DE TES VOISINS :\n${voisins}`,
    '---',
    `[INSTRUCTION FINALE — identique pour toutes les civs]\n${instruction}`
  ].filter(s => s !== ''); // retirer sections vides

  return sections.join('\n\n');
}

module.exports = { buildPromptFree };