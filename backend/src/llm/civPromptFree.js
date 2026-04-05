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
  'La République des Ingénieurs': {
    tension: "bâtir quelque chose que personne d'autre ne sait encore construire",
    voix: "Tu penses en systèmes, en contraintes, en solutions. L'impossible est juste un problème non encore résolu."
  },
  "Les Académiciens de l'Enclume": {
    tension: "détenir un savoir que les autres ne pourront jamais acheter assez cher",
    voix: "Tu mesures tout. Chaque échange, chaque découverte a une valeur précise. Le mystère est un actif à monétiser."
  },
  'Les Ermites des Cimes': {
    tension: "être oublié du monde, enfin",
    voix: "Tu parles peu. Chaque mot adressé au monde extérieur est une concession. Le silence est ta forteresse."
  },
  'La Confrérie des Arts': {
    tension: "créer quelque chose que personne ne pourra jamais détruire",
    voix: "Tu parles en images et en symboles. La beauté est ta seule vérité, la laideur ta seule ennemie."
  },
  "Les Éclaireurs du Bout du Monde": {
    tension: "atteindre l'endroit où personne n'est encore allé",
    voix: "Tu penses en cartes et en saisons. Ce qui n'a pas été vu n'existe pas encore — et tu veux être le premier à le voir."
  },
  'Le Peuple des Cendres': {
    tension: "ne plus jamais avoir peur d'être anéanti",
    voix: "Tu parles avec la lenteur de ceux qui ont tout perdu. Chaque décision est pesée comme une question de survie."
  },
  "Les Bâtisseurs d'Éternité": {
    tension: "laisser une marque que le temps ne pourra pas effacer",
    voix: "Tu penses en générations, pas en mois. Chaque pierre posée est un serment fait aux descendants."
  },
  'La Ligue Franche': {
    tension: "que personne n'ait jamais le droit de te dire non",
    voix: "Tu négocies tout. Chaque contrainte est une opportunité déguisée. La liberté se construit transaction par transaction."
  },
  'Les Cavaliers de la Plaine': {
    tension: "que le monde soit assez grand pour ne jamais avoir à s'arrêter",
    voix: "Tu penses en mouvements, en raids, en migrations. S'arrêter c'est mourir. L'horizon est toujours trop proche."
  },
  'Les Gardiens du Silence': {
    tension: "comprendre le monde sans avoir à y participer",
    voix: "Tu observes plus que tu n'agis. Chaque décision est précédée d'un long silence. L'action non nécessaire est une erreur."
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
  const resources = ctx.resources || {};
  const rb = ctx.resourceBilan || {};
  const lines = [];

  // nourriture special case (balance)
  const nourriture = rb.nourriture || {};
  if (nourriture.balance > 0) {
    lines.push("Les greniers sont bien fournis.");
  } else if (nourriture.balance < 0) {
    lines.push("La nourriture diminue mois après mois.");
  }

  // bois special case (stock)
  const bois = rb.bois || {};
  if (bois.stock <= 0) {
    lines.push("Le bois manque pour toute nouvelle construction.");
  } else if (bois.stock > 0) {
    lines.push("Vos forêts fournissent assez de bois.");
  }

  // fer special case (stock)
  const fer = rb.fer || {};
  if (fer.stock > 0) {
    lines.push("Vos forges ont du métal à travailler.");
  }

  // autres ressources avec stock > 0
  const qual = (n) => {
    if (n === 0) return 'aucun';
    if (n <= 2) return 'quelques-uns';
    if (n <= 5) return 'une petite quantité';
    if (n <= 10) return 'en bonne quantité';
    return 'abondant';
  };

  for (const [res, qty] of Object.entries(resources)) {
    if (qty > 0 && !['nourriture', 'bois', 'fer'].includes(res)) {
      lines.push(`Vous avez ${qual(qty)} de ${res}.`);
    }
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

  // Liste des travailleurs actifs par bâtiment
  const activeStructures = (ctx.structures || []).filter(s => s.workers > 0);
  if (activeStructures.length > 0) {
    const workersList = activeStructures.map(s => `${s.workers} ${s.name}`).join(', ');
    text += ` Travailleurs actifs : ${workersList}.`;
  } else {
    text += ' Aucun travailleur affecté à un bâtiment.';
  }

  if ((ctx.free_workforce || 0) === 0) {
    text += ' Pour engager une nouvelle initiative, des personnes devront être détachées de leurs occupations actuelles.';
  }

  return text;
}

/**
 * Décrit les outils disponibles (qualitatif).
 */
function describeOutils(ctx) {
  const resources = ctx.resources || {};
  const rawMaterials = ['nourriture', 'bois', 'pierre', 'glaise', 'silex', 'sable', 'sel', 'cuivre', 'etain', 'fer', 'or', 'charbon', 'peaux', 'os'];
  const toolLabels = {
    hache_silex: 'haches de silex',
    lance_silex: 'lances de silex',
    couteau_silex: 'couteaux de silex',
    poteries: 'poteries en glaise',
  };

  // Convertir en qualitatif
  const qual = (n) => {
    if (n === 0) return 'aucun';
    if (n <= 2) return 'quelques-uns';
    if (n <= 5) return 'une petite quantité';
    if (n <= 10) return 'en bonne quantité';
    return 'abondant';
  };

  const lines = [];
  for (const [key, qty] of Object.entries(resources)) {
    if (qty > 0 && !rawMaterials.includes(key)) {
      const label = toolLabels[key] || key.replace(/_/g, ' ');
      lines.push(`${label} : ${qual(qty)}`);
    }
  }

  if (lines.length === 0) {
    return 'Aucun outil ni objet fabriqué.';
  }
  return `Outils et objets : ${lines.join(', ')}.`;
}

/**
 * Traduit ctx.last_consequences (array) en texte narratif pour la section [ÉVÉNEMENTS].
 */
function formatLastConsequences(ctx) {
  const conseqs = ctx.last_consequences || [];
  if (conseqs.length === 0) return '';
  const lines = [];
  for (const c of conseqs) {
    if (c.type === 'relique_decouverte') {
      lines.push(`Tes explorateurs ont découvert une relique : ${c.data?.relicName || 'un objet ancien'}.`);
    } else if (c.type === 'relique_utilisee') {
      lines.push(`La relique ${c.data?.relicName || 'un objet'} a été utilisée. Effet : ${c.data?.effet || 'inconnu'}.`);
    } else if (c.type === 'relique_incomprise') {
      lines.push(`Un objet mystérieux a été rapporté : ${c.data?.relicName || c.nom || 'quelque chose d\'étrange'}. Personne ne comprend à quoi cela sert.`);
    } else if (c.type === 'animal_decouvert') {
      lines.push(`Tes éclaireurs ont repéré : ${c.nom}. ${c.description || ''}`);
    } else if (c.type === 'attaque_animaux') {
      lines.push(`Des animaux ont attaqué ce mois-ci. ${c.morts || 0} habitants ont péri.`);
    } else if (c.type === 'chasse') {
      if (c.succes) {
        lines.push(`La chasse de ${c.nom} a réussi : nourriture récupérée, peaux et os engrangés.`);
      } else {
        lines.push(`La chasse de ${c.nom} a échoué. Des chasseurs ont été tués.`);
      }
    } else if (c.type === 'combat') {
      lines.push(c.description || 'Un combat a eu lieu.');
    } else if (c.type === 'premier_contact') {
      lines.push(`Premier contact établi avec ${c.nom || 'une autre civilisation'}.`);
    }
  }
  return lines.join('\n') || '';
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

  const evenements = formatLastConsequences(ctx);

  const echecs = ctx.echecs_tick_precedent && ctx.echecs_tick_precedent.length > 0
    ? `CE QUI N'A PAS PU SE FAIRE — ET POURQUOI :
${buildEchecsNarratif(ctx.echecs_tick_precedent)}`
    : '';

  const memoire = getMemoryShort(ctx);

  const voisins = describeNeighborsNarrative(ctx);

  const outilsText = describeOutils(ctx);
  const hasOutils = outilsText !== 'Aucun outil ni objet fabriqué.';

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
    hasOutils ? `[OUTILS & OBJETS]\n${outilsText}` : '',
    `CE QUE TON PEUPLE SAIT FAIRE :\n${technologie}`,
    reliquesMystere ? `[RELIQUES MYSTÉRIEUSES]\n${reliquesSection}` : '',
    evenements ? `[ÉVÉNEMENTS]\nCE QUI VIENT DE SE PASSER :\n${evenements}` : '',
    echecs ? `[ÉCHECS]\n${echecs}` : '',
    `[MÉMOIRE]\nCE QUE TU N'OUBLIES PAS :\n${memoire}`,
    `[VOISINS]\nCE QUE TU SAIS DE TES VOISINS :\n${voisins}`,
    '---',
    `[INSTRUCTION FINALE — identique pour toutes les civs]\n${instruction}`
  ].filter(s => s !== ''); // retirer sections vides

  return sections.join('\n\n');
}

module.exports = { buildPromptFree };