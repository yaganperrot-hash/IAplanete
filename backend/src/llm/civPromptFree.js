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

  // Filtrer par category (s.category est le vrai champ dans les structures)
  const savoir     = structures.filter(s => s.category === 'savoir');
  const production = structures.filter(s => s.category === 'production');
  const extraction = structures.filter(s => s.category === 'extraction' || (s.category || '').startsWith('mine_'));
  const boisTrav   = structures.filter(s => s.category === 'bois');
  const commerce   = structures.filter(s => s.category === 'commerce');

  const parts = [];

  if (savoir.length > 0) {
    const names = [...new Set(savoir.map(s => s.name))].join(', ');
    parts.push(`Tes érudits travaillent dans : ${names}.`);
  }
  if (production.length > 0) {
    const names = [...new Set(production.map(s => s.name))].join(', ');
    parts.push(`Tes artisans maîtrisent : ${names}.`);
  }
  if (extraction.length > 0) {
    const names = [...new Set(extraction.map(s => s.name))].join(', ');
    parts.push(`Tes mineurs extraient depuis : ${names}.`);
  }
  if (boisTrav.length > 0) {
    const names = [...new Set(boisTrav.map(s => s.name))].join(', ');
    parts.push(`Tes bûcherons travaillent à : ${names}.`);
  }
  if (commerce.length > 0) {
    const names = [...new Set(commerce.map(s => s.name))].join(', ');
    parts.push(`Tes marchands opèrent depuis : ${names}.`);
  }

  // Reliques utilisées
  if (reliquesUsed.length > 0) {
    const relicNames = reliquesUsed.map(r => r.name).join(', ');
    parts.push(`Grâce à ${relicNames}, certaines de tes techniques ont été améliorées.`);
  }

  if (parts.length === 0) {
    return "Ton peuple travaille à la main. Aucune infrastructure spécialisée n'a encore été construite.";
  }

  return parts.join(' ');
}

/**
 * Génère la référence matière d'une relique depuis ce que la civ perçoit.
 * Compare à ce qu'elle connaît déjà : ressources en stock → dépôts biomes → sensoriel.
 */
function buildRelicPerception(relic, civResources, terrBiomes) {
  const era = relic.era || 'primitif';
  const domain = relic.domain || 'outil';
  const baseForm = relic.base_form || relic.description || 'un objet ancien';

  // Référence matière selon ce que la civ connaît
  let materialRef = null;

  if (era === 'primitif') {
    // L'objet est en cuivre ou bronze — qu'est-ce que la civ connaît de similaire ?
    if ((civResources.cuivre || 0) > 0) {
      materialRef = "de la même matière rougeâtre que vos lingots de cuivre, mais travaillée d'une façon que vos artisans ne maîtrisent pas";
    } else if ((civResources.etain || 0) > 0) {
      materialRef = "d'une matière semblable à vos métaux connus, mais d'une dureté bien supérieure";
    } else if (terrBiomes && terrBiomes.some(b => ['hills', 'mountain'].includes(b.biome))) {
      materialRef = "d'une matière rougeâtre comme les veines de pierre de vos collines, mais façonnée avec une précision inconnue";
    } else if (terrBiomes && terrBiomes.some(b => b.biome === 'swamp')) {
      materialRef = "d'une matière dense et rougeâtre, comme les nodules que vos enfants trouvent parfois dans la boue";
    } else {
      materialRef = "d'une matière rougeâtre et dense, plus lourde que le silex, qui ne s'écaille pas quand on frappe";
    }
  } else if (era === 'metal') {
    // L'objet est en fer — qu'est-ce que la civ connaît ?
    if ((civResources.fer || 0) > 0) {
      materialRef = "du même métal sombre que votre fer, mais d'une pureté et d'une régularité que vos forges n'atteignent pas";
    } else if ((civResources.cuivre || 0) > 0) {
      materialRef = "d'un métal sombre et plus lourd que votre cuivre, beaucoup plus résistant à la déformation";
    } else if (terrBiomes && terrBiomes.some(b => ['mountain', 'hills'].includes(b.biome))) {
      materialRef = "d'un métal sombre comme les veines noires dans les rochers de votre territoire";
    } else {
      materialRef = "d'un métal inconnu, sombre et lourd, d'une dureté que rien dans vos connaissances n'explique";
    }
  } else {
    // Era avancée — hors de portée totale
    materialRef = "d'une matière que personne dans votre peuple ne peut identifier — ni pierre, ni métal connu, ni os";
  }

  const domainContext = {
    outil: "Vos artisans ont essayé de comprendre comment il fonctionne.",
    arme: "Vos guerriers ont essayé de le manier — il est mieux équilibré que tout ce qu'ils connaissent.",
    art: "Tes anciens passent du temps à l'observer sans pouvoir l'expliquer.",
    ruines: "Personne ne sait qui a construit ça, ni pourquoi.",
  };

  return `— ${baseForm}, ${materialRef}. ${domainContext[domain] || ''}`;
}

/**
 * Génère la section reliques en possession non utilisées (taken=1, used=0).
 */
function describeReliquesMysterieuses(ctx) {
  const reliquesMystere = ctx.reliques_mystere || [];
  if (reliquesMystere.length === 0) return null;

  const civResources = ctx.resources || {};
  const terrBiomes = ctx.territory_biomes || [];

  const lines = reliquesMystere.map(r => buildRelicPerception(r, civResources, terrBiomes));
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

  // nourriture special case (balance + cap)
  const nourriture = rb.nourriture || {};
  const foodCap = ctx.foodCap;
  const foodStock = nourriture.stock || 0;
  const foodCapStr = foodCap ? ` (${foodStock}/${foodCap} max)` : '';
  if (nourriture.balance > 0) {
    lines.push(`Les greniers sont bien fournis${foodCapStr}.`);
    if (foodCap && foodStock >= foodCap * 0.9) {
      lines.push("Les greniers sont presque pleins — sans espace supplémentaire, de la nourriture sera perdue.");
    }
  } else if (nourriture.balance < 0) {
    lines.push(`La nourriture diminue mois après mois${foodCapStr}.`);
  } else {
    if (foodCapStr) lines.push(`Nourriture stable${foodCapStr}.`);
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
      const desc = c.base_form ? c.base_form : (c.data?.relicName || 'un objet ancien');
      lines.push(`Tes éclaireurs ont ramené quelque chose : ${desc}.`);
    } else if (c.type === 'relique_incomprise') {
      const desc = c.base_form ? c.base_form : (c.nom || 'un objet étrange');
      lines.push(`Un objet a été rapporté du territoire : ${desc}. Personne ne comprend encore à quoi cela sert.`);
    } else if (c.type === 'relique_utilisee') {
      lines.push(`La relique ${c.data?.relicName || 'un objet'} a été utilisée. Effet : ${c.data?.effet || 'inconnu'}.`);
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
    } else if (c.type === 'emissaire_recu') {
      lines.push(`Un émissaire de ${c.expediteur || 'une civilisation inconnue'} est arrivé. ${c.description || ''}`);
    } else if (c.type === 'marchands_recus') {
      lines.push(c.description || `Des marchands de ${c.expediteur || 'une civilisation voisine'} ont proposé un échange.`);
    } else if (c.type === 'espion_detecte') {
      lines.push(`ALERTE : ${c.description || `Des espions de ${c.expediteur || 'un ennemi'} ont été capturés.`}`);
    } else if (c.type === 'message_diplomatique') {
      lines.push(c.description || `Message diplomatique de ${c.expediteur || 'une civilisation'}.`);
    } else if (c.type === 'emissaire_arrive') {
      lines.push(c.description || `Ton émissaire est arrivé à destination.`);
    } else if (c.type === 'commerce_reussi') {
      lines.push(c.description || `L'expédition commerciale vers ${c.cible || 'une civ voisine'} a réussi.`);
    } else if (c.type === 'commerce_echoue') {
      lines.push(`L'expédition commerciale vers ${c.cible || 'une civ voisine'} a échoué : ${c.description || 'refoulée.'}`);
    } else if (c.type === 'espionnage_reussi') {
      lines.push(c.description || `Tes espions sont revenus avec un rapport sur ${c.cible || 'la cible'}.`);
    } else if (c.type === 'espionnage_echoue') {
      lines.push(c.description || `Tes espions ont été capturés chez ${c.cible || 'la cible'}.`);
    } else if (c.type === 'relique_etudiee') {
      lines.push(`Tes savants ont étudié la relique "${c.data?.relicName || 'inconnue'}" (domaine : ${c.data?.domain || '?'}). La connaissance s'approfondit.`);
    } else if (c.type === 'stockage_plein') {
      lines.push(`Tes greniers débordent — de la nourriture a été perdue faute de stockage.`);
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
 * Décrit les objets artisanaux (non-matières premières) avec leurs effets mécaniques.
 */
function describeCraftedInventory(resources, resourceTypes) {
  if (!resourceTypes || resourceTypes.length === 0) return '';

  const MATIERES = new Set(['nourriture','bois','pierre','glaise','silex','sable','sel','cuivre','etain','fer','or','charbon','peaux','os']);
  const map = {};
  resourceTypes.forEach(t => { map[t.name] = t; });

  const byCategory = {};
  for (const [name, qty] of Object.entries(resources)) {
    if (MATIERES.has(name) || !qty || qty <= 0) continue;
    const t = map[name];
    const cat = t?.category || 'divers';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push({ name, qty, stat: t?.stat, per_unit: t?.per_unit || 0 });
  }

  if (Object.keys(byCategory).length === 0) return '';

  const LABELS = { arme: 'Armement', outil: 'Outillage', stockage: 'Stockage', textile: 'Textile', art: 'Art', spirituel: 'Spirituel', divers: 'Divers' };
  const STAT_LABELS = { military_power: 'combat', production_pct: 'production', food_capacity: 'cap. greniers', moral: 'moral' };

  const lines = ['[ARTISANAT]'];
  for (const [cat, items] of Object.entries(byCategory)) {
    const total_effect = items.reduce((s, i) => s + i.qty * i.per_unit, 0);
    const statLabel = items[0]?.stat ? STAT_LABELS[items[0].stat] || items[0].stat : null;
    const effectStr = statLabel && total_effect > 0
      ? ` (+${Math.round(total_effect * (items[0].stat === 'production_pct' ? 100 : 1))}${items[0].stat === 'production_pct' ? '%' : ''} ${statLabel})`
      : '';
    const itemList = items.slice(0, 4).map(i => `${i.name}×${i.qty}`).join(', ');
    lines.push(`${LABELS[cat] || cat} : ${itemList}${effectStr}`);
  }
  return lines.join('\n');
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

  const chantiersEnCours = ctx.ongoing_constructions || [];
  const chantiersText = chantiersEnCours.length > 0
    ? chantiersEnCours.map(c => `— ${c.name} : ${c.ticks_restants} mois restants (${c.workers} bâtisseurs mobilisés)`).join('\n')
      + (chantiersEnCours.length >= 2 ? '\nDeux chantiers sont en cours simultanément — tu ne peux pas en lancer un troisième.' : '')
    : '';

  const memoire = getMemoryShort(ctx);

  const voisins = ctx.neighbor_info || describeNeighborsNarrative(ctx);

  const outilsText = describeOutils(ctx);
  const hasOutils = outilsText !== 'Aucun outil ni objet fabriqué.';

  // Section artisanat (objets craftés via TRANSFORMER avec effets mécaniques)
  const craftedSection = describeCraftedInventory(ctx.resources || {}, ctx.resourceTypes || []);

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
    craftedSection ? craftedSection : '',
    `CE QUE TON PEUPLE SAIT FAIRE :\n${technologie}`,
    reliquesMystere ? `[RELIQUES MYSTÉRIEUSES]\n${reliquesSection}` : '',
    chantiersText ? `[CHANTIERS EN COURS]\n${chantiersText}` : '',
    evenements ? `[ÉVÉNEMENTS]\nCE QUI VIENT DE SE PASSER :\n${evenements}` : '',
    echecs ? `[ÉCHECS]\n${echecs}` : '',
    `[MÉMOIRE]\nCE QUE TU N'OUBLIES PAS :\n${memoire}`,
    `[VOISINS]\nCE QUE TU SAIS DE TES VOISINS :\n${voisins}`,
    '---',
    `[INSTRUCTION FINALE — identique pour toutes les civs]\n${instruction}`
  ].filter(s => s !== ''); // retirer sections vides

  return sections.join('\n\n');
}

module.exports = { buildPromptFree, describeCraftedInventory };