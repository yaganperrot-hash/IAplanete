// Civ LLM — Ollama local (V4 : prompt 3 couches narratives + réponse JSON) — fallback : civMockLLM
const { decide: mockDecide } = require('./civMockLLM');

const DEFAULT_MODEL = 'mistral-nemo';
const DEFAULT_HOST  = 'http://localhost:11434';

let ollamaChat = null;
let model      = DEFAULT_MODEL;

function init() {
  try {
    const { Ollama } = require('ollama');
    const host = process.env.OLLAMA_HOST || DEFAULT_HOST;
    model = process.env.OLLAMA_MODEL || DEFAULT_MODEL;
    const client = new Ollama({ host });
    ollamaChat = client.chat.bind(client);
    console.log(`✓ Ollama (Civilisations V4) initialisé — modèle : ${model} sur ${host}`);
    return true;
  } catch (err) {
    console.warn(`⚠️  Ollama init échoué: ${err.message} — mock activé`);
    return false;
  }
}

// ─── Jauges psychologiques ─────────────────────────────────────────────────────

function getJaugeSecurite(ctx) {
  const moralScore     = Math.min(100, Math.max(0, ctx.moral || 0));
  const nourriStock    = ctx.resourceBilan?.nourriture?.stock || 0;
  const nourritureScore = nourriStock > 500 ? 100 : nourriStock > 200 ? 60 : nourriStock > 50 ? 30 : 0;
  const score = Math.round((moralScore * 0.5) + (nourritureScore * 0.5));

  if (score >= 75) return "Ton peuple se sent en sécurité. Les greniers sont remplis, les esprits sont sereins. La peur ne dicte pas vos décisions en ce moment.";
  if (score >= 50) return "Une certaine inquiétude flotte dans l'air. Les ressources sont suffisantes, mais la mémoire des temps difficiles reste proche. La prudence guide vos choix.";
  if (score >= 25) return "La peur est présente. Les ventres ne sont pas toujours pleins, et le peuple commence à douter. Chaque décision est pesée à l'aune de la survie.";
  return "Ton peuple est en état de survie. La peur dicte tout. Chaque journée est une lutte, et les murmures de désespoir se font entendre.";
}

function getJaugeOuverture(ctx) {
  const exploredRatio  = Math.min(1, (ctx.territory_count || 0) / 80);
  const hasNeighbors   = (ctx.neighbors || []).length > 0;
  const isExplorer     = (ctx.valeurs || []).includes('exploration');
  const isIsolationist = (ctx.valeurs || []).includes('isolationnisme');

  if (isIsolationist) return "Ton peuple se méfie de l'inconnu. Ce qui vient de l'extérieur apporte plus souvent la menace que l'opportunité. Vos frontières sont votre force.";
  if (isExplorer && exploredRatio > 0.3) return "Ton peuple est avide de découvertes. Chaque horizon inexploré est une promesse, pas une menace. L'inconnu vous attire.";
  if (hasNeighbors) return "Des voisins ont été découverts. L'inconnu commence à prendre des visages. Cela éveille autant la curiosité que la méfiance.";
  if (exploredRatio < 0.1) return "Le monde au-delà de vos terres est presque entièrement inconnu. Cela pèse sur les esprits — est-ce un vide à remplir ou un danger à craindre ?";
  return "Ton peuple commence à comprendre les contours de son territoire. L'exploration reste prudente, mais l'envie d'aller plus loin grandit.";
}

function getJaugeFierte(ctx) {
  const frustTicks       = ctx.frustration_ticks || {};
  const totalFrustration = Object.values(frustTicks).reduce((a, b) => a + b, 0);
  const hasWar = (ctx.valeurs || []).includes('guerre');
  const hasArt = (ctx.valeurs || []).includes('art');

  if (totalFrustration === 0 && (ctx.moral || 0) >= 65) {
    if (hasWar) return "Ton peuple se sent fort et redoutable. Aucune valeur n'est bafouée, aucun ennemi ne vous a encore défié. La fierté est intacte, presque agressive.";
    if (hasArt) return "Ton peuple est fier de ce qu'il crée. Vos œuvres témoignent de votre existence. Cette fierté est douce mais profonde.";
    return "Ton peuple est satisfait de lui-même en ce moment. Aucune honte, aucune défaite ne pèse sur vos épaules.";
  }
  if (totalFrustration > 5) return "Des valeurs importantes sont bafouées depuis trop longtemps. Une honte sourde commence à ronger la cohésion du peuple. Quelque chose doit changer.";
  return "La fierté de ton peuple est entière, mais fragile. Une seule déception de trop pourrait faire basculer l'humeur collective.";
}

// ─── Textes d'intendance ───────────────────────────────────────────────────────

function getTextePopulation(ctx) {
  const libres = ctx.free_workforce || 0;
  const total  = ctx.population || 0;
  const trend  = ctx.population_trend || 'stable';
  const actifs = (ctx.structures || []).filter(s => (s.workers || 0) > 0);

  let t = '';
  if (libres === 0) {
    t += `Tous tes sujets sont occupés — pas un seul bras disponible. Si tu veux entreprendre quelque chose de nouveau, tu dois d'abord ABANDONNER une tâche existante pour libérer de la main-d'œuvre. `;
  } else if (libres < total * 0.1) {
    t += `Presque toute ta population est mobilisée. Il reste ${libres} personnes disponibles — à peine assez pour une nouvelle initiative. `;
  } else if (libres > total * 0.5) {
    t += `Une grande partie de ton peuple est sans occupation (${libres} personnes sur ${total}). Des bras qui ne travaillent pas, c'est du gaspillage — ou une opportunité. `;
  } else {
    t += `Tu disposes de ${libres} personnes disponibles sur une population de ${total}. `;
  }

  // Avertissement sans-abri (PRIORITÉ ABSOLUE)
  const homeless = ctx.homeless || 0;
  const homelessDeaths = ctx.last_consequences?.homelessDeaths || 0;

  if (homelessDeaths > 0) {
    t += `⚠️ URGENCE : ${homelessDeaths} de tes sujets sont morts de froid ce mois-ci faute d'abri. `;
  }
  if (homeless > 0) {
    const pct = Math.round((homeless / total) * 100);
    t += `${homeless} personnes (${pct}% de la population) dorment dehors sans abri. En hiver, cela tue. Construire une Habitation (rôle: habitation) est une question de survie. `;
  }

  if (trend === 'croissance') t += 'Les naissances sont nombreuses. Le peuple est en expansion. ';
  else if (trend === 'déclin') t += 'Les morts dépassent les naissances. La population rétrécit. ';
  else t += 'La population est relativement stable. ';

  if (actifs.length > 0) {
    t += 'Répartition actuelle : ';
    t += actifs.map(s => `${s.workers} pers. à "${s.name}" (${s.production || '?'})`).join(', ');
    t += '.';
  }

  return t.trim();
}

function getTexteRessources(ctx) {
  const rb     = ctx.resourceBilan || {};
  const saison = ctx.season || 'ete';
  const lines  = [];

  const nourriStock   = rb.nourriture?.stock || 0;
  const nourriBalance = rb.nourriture?.balance || 0;
  if (nourriStock <= 0) {
    lines.push("Tes greniers sont vides. La famine est là.");
  } else if (nourriStock < 50) {
    lines.push(`Tes greniers sont presque vides (${nourriStock} unités). La famine approche.`);
  } else if (nourriStock < 200) {
    lines.push(`Les réserves alimentaires sont maigres (${nourriStock}). Une mauvaise récolte suffirait à provoquer la famine.`);
  } else if (nourriStock < 600) {
    lines.push(`La nourriture est suffisante (${nourriStock}), mais les surplus sont modestes.`);
  } else {
    lines.push(`Les greniers débordent (${nourriStock}). Ton peuple est bien nourri.`);
  }
  if (nourriBalance < 0 && ctx.food_famine_in != null) {
    lines.push(`⚠️ ALERTE : au rythme actuel, famine dans ${ctx.food_famine_in} mois si rien ne change !`);
  }

  // Bois — critique en automne/hiver
  const boisStock = rb.bois?.stock || 0;
  if (saison === 'hiver' || saison === 'automne') {
    const boisNeed = Math.round((ctx.population || 0) * 1.5);
    if (boisStock < 50) {
      lines.push(`⚠️ Bois très bas (${boisStock}). En cette saison froide, cela peut tuer les sans-abri.`);
    } else if (boisStock < boisNeed) {
      lines.push(`Bois disponible : ${boisStock} (besoin estimé pour l'hiver : ${boisNeed}). Insuffisant.`);
    } else {
      lines.push(`Bois en bonne quantité (${boisStock}). Le froid ne vous surprendra pas.`);
    }
  }

  // Matériaux de construction
  const matos = [];
  const pierreStock = rb.pierre?.stock || 0;
  const glaiseStock = rb.glaise?.stock || 0;

  if (saison !== 'hiver') {
    if (boisStock > 0) matos.push(`bois (${boisStock})`);
    else matos.push(`bois : aucun stock`);
  }
  if (pierreStock > 0) matos.push(`pierre (${pierreStock})`);
  else matos.push(`pierre : aucun stock`);
  if (glaiseStock > 0) matos.push(`glaise (${glaiseStock})`);
  else matos.push(`glaise : aucun stock`);
  if (matos.length > 0) lines.push(`Matériaux de construction : ${matos.join(', ')}.`);
  else if (saison !== 'hiver') lines.push('Peu de matériaux disponibles. Construire coûtera des ressources que vous n\'avez pas.');

  // Ressources animales
  const peauxStock = rb.peaux?.stock || 0;
  const osStock = rb.os?.stock || 0;
  if (peauxStock > 0 || osStock > 0) {
    const ressourcesAnim = [];
    if (peauxStock > 0) ressourcesAnim.push(`peaux (${peauxStock})`);
    if (osStock > 0) ressourcesAnim.push(`os (${osStock})`);
    lines.push(`Ressources animales : ${ressourcesAnim.join(', ')}.`);
  }

  // Minéraux
  const mineraux = [];
  if ((rb.cuivre?.stock || 0) > 0) mineraux.push(`cuivre (${rb.cuivre.stock})`);
  if ((rb.fer?.stock    || 0) > 0) mineraux.push(`fer (${rb.fer.stock})`);
  if ((rb.or?.stock     || 0) > 0) mineraux.push(`or (${rb.or.stock})`);
  if ((rb.charbon?.stock || 0) > 0) mineraux.push(`charbon (${rb.charbon.stock})`);
  if ((rb.etain?.stock  || 0) > 0) mineraux.push(`étain (${rb.etain.stock})`);
  if ((rb.sel?.stock    || 0) > 0) mineraux.push(`sel (${rb.sel.stock})`);
  if ((rb.sable?.stock  || 0) > 0) mineraux.push(`sable (${rb.sable.stock})`);
  if (mineraux.length > 0) lines.push(`Minéraux : ${mineraux.join(', ')}.`);

  return lines.join(' ');
}

function getTexteMoral(ctx) {
  const moral      = ctx.moral || 50;
  const frustTicks = ctx.frustration_ticks || {};
  const frustreesActives = Object.entries(frustTicks)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ valeur: k, score: v }))
    .sort((a, b) => b.score - a.score);

  let t;
  if      (moral >= 75) t = "L'ambiance est excellente. Les visages sont sereins, le peuple fait confiance à ses dirigeants.";
  else if (moral >= 60) t = "Le moral est correct. La vie suit son cours, sans enthousiasme particulier mais sans mécontentement.";
  else if (moral >= 45) t = "Une tension sourde traverse le peuple. On murmure. Certains remettent en question les décisions passées.";
  else if (moral >= 30) t = "Le mécontentement est visible. Des attroupements se forment, le peuple gronde.";
  else                  t = "Le peuple est au bord de la révolte. La confiance est rompue. Des déserteurs peuvent partir.";

  if (frustreesActives.length > 0) {
    const top = frustreesActives[0];
    t += ` Ce qui pèse le plus : la valeur "${top.valeur}" est bafouée depuis ${top.score} ticks sans réponse.`;
    if (frustreesActives.length > 1) {
      t += ` La valeur "${frustreesActives[1].valeur}" commence aussi à faire l'objet de critiques.`;
    }
  }
  return t;
}

function getTexteExploration(ctx) {
  const lines    = [];
  const cases    = ctx.territory_count || 0;
  const terrFree = ctx.territory_free  || 0;

  if      (cases < 10) lines.push("Votre territoire est minuscule. Vous connaissez à peine les abords de votre camp.");
  else if (cases < 30) lines.push(`Vous occupez ${cases} cases (${terrFree} encore libres pour construire). Le monde immédiat est connu, les horizons flous.`);
  else                 lines.push(`Votre territoire s'étend sur ${cases} cases (${terrFree} libres). Vous maîtrisez un espace considérable.`);

  if (terrFree === 0) lines.push("⚠️ Territoire saturé — toutes les cases sont construites. Il faut EXPLORER pour s'étendre !");

  const neighbors = ctx.neighbors || [];
  if (neighbors.length === 0) {
    lines.push("Aucune autre civilisation connue.");
  } else {
    for (const v of neighbors) {
      let info = `Tu connais ${v.nom} (relation: ${v.relation}, puissance militaire: ${v.military_power})`;
      if (v.relation === 'guerre')   info += ' ⚠️ EN GUERRE !';
      if (v.relation === 'alliance') info += ' ✅ Allié.';
      lines.push(info + '.');
    }
  }

  const deposits = ctx.known_deposits || [];
  if (deposits.length > 0) {
    const uniq = [...new Set(deposits.map(d => d.mineral))];
    lines.push(`Gisements repérés hors territoire : ${uniq.join(', ')}. Explorer dans ces directions peut rapporter.`);
  }

  return lines.join(' ');
}

function getTexteReliques(ctx) {
  const reliques = ctx.reliques_decouvertes || [];
  if (reliques.length === 0) return '';
  const lines = [];
  lines.push('Reliques découvertes par vos explorateurs :');
  for (const r of reliques) {
    let usage = '';
    if (r.type === 'objet' && r.domain === 'arme') {
      usage = 'Cette relique pourrait être utilisée comme arme cérémonielle ou comme outil de sacrifice.';
    } else if (r.type === 'art') {
      usage = 'Cette œuvre pourrait inspirer vos artistes ou servir de symbole religieux.';
    } else if (r.type === 'construction') {
      usage = 'Ces ruines pourraient être étudiées pour améliorer vos techniques de construction.';
    } else {
      usage = 'Cette relique pourrait avoir des usages pratiques ou symboliques.';
    }
    lines.push(`- ${r.name} (${r.type}, ${r.domain}) : ${r.description} ${usage}`);
  }
  return lines.join(' ');
}

function getTexteConsequencesReliques(ctx) {
  const conseqs = ctx.last_consequences || [];
  const lines = [];
  for (const c of conseqs) {
    if (c.type === 'relique_decouverte') {
      lines.push(`Vos explorateurs viennent de découvrir une relique : ${c.data?.relicName || 'une relique'}. Cette découverte pourrait influencer votre stratégie.`);
    }
    if (c.type === 'relique_utilisee') {
      lines.push(`Votre peuple a utilisé la relique ${c.data?.relicName || 'une relique'} pour ${c.data?.effet || 'obtenir un bonus'}. Cela pourrait ouvrir de nouvelles possibilités.`);
    }
  }
  return lines.join(' ');
}

function getTexteAnimaux(ctx) {
  const groups = ctx.animal_groups || [];
  const lastConsequences = ctx.last_consequences || [];
  const lines = [];

  // Groupes agressifs proches
  const agressifs = groups.filter(g => g.type === 'agressif');
  if (agressifs.length > 0) {
    lines.push("Une meute de loups rôde à la lisière de ton territoire. Tes champs sont menacés.");
  }

  // Groupes peureux
  const peureux = groups.filter(g => g.type === 'peureux');
  if (peureux.length > 0) {
    lines.push("Un troupeau de cerfs paît non loin. Une opportunité pour tes chasseurs.");
  }

  // Attaque récente (via last_consequences)
  const attaque = lastConsequences.find(c => c.type === 'attaque_animaux');
  if (attaque) {
    lines.push(`Cette nuit, des loups ont tué ${attaque.morts || 2} de tes habitants. Sans armes, tes gardes n'ont pu que fuir.`);
  }

  return lines.join(' ');
}

function getRoleIntro(ctx) {
  const nom = ctx.nom;
  const gov = ctx.gouvernement?.toLowerCase() || '';
  const description = ctx.description ? ctx.description + ' ' : '';
  let role;
  if (gov.includes('monarchie') || gov.includes('royaume')) {
    role = `le Roi de ${nom}`;
  } else if (gov.includes('aristocratie')) {
    role = `le Conseil des Nobles de ${nom}`;
  } else if (gov.includes('théocratie')) {
    role = `le Grand Prêtre de ${nom}`;
  } else if (gov.includes('tribu') || gov.includes('tribal')) {
    role = `le Chef de la tribu ${nom}`;
  } else if (gov.includes('république')) {
    role = `le Sénat de ${nom}`;
  } else if (gov.includes('démocratie')) {
    role = `l'Assemblée du peuple de ${nom}`;
  } else {
    role = `le dirigeant de ${nom}`;
  }
  const intro = `Tu es ${role}. ${description}`.trim();
  const anchor = "Ton peuple est réel. Ses souffrances, ses espoirs, ses décisions t'appartiennent. Tu n'as pas à gagner — tu as à exister.";
  return `${intro}\n${anchor}`;
}

function buildDynamicQuestion(ctx) {
  // Vérifier les urgences vitales
  const homeless = ctx.homeless || 0;
  const homelessDeaths = ctx.last_consequences?.homelessDeaths || 0;
  const foodFamineIn = ctx.food_famine_in;
  const rb = ctx.resourceBilan || {};
  const boisStock = rb.bois?.stock || 0;
  const boisNeed = (ctx.season === 'hiver' || ctx.season === 'automne') ? Math.round((ctx.population || 0) * 1.5) : 0;
  const peauxStock = rb.peaux?.stock || 0;
  const osStock = rb.os?.stock || 0;
  const hasHomelessUrgency = homeless > 0 || homelessDeaths > 0;
  const hasFamineUrgency = foodFamineIn != null && foodFamineIn < 10;
  const hasWoodUrgency = (ctx.season === 'hiver' || ctx.season === 'automne') && boisStock < boisNeed;

  if (hasHomelessUrgency || hasFamineUrgency || hasWoodUrgency) {
    // Urgence vitale présente : retourner la phrase générique
    return "Analyse la situation selon tes valeurs et tes instincts. Tu es libre : construire, explorer, déclarer la guerre, créer de l'art, réorganiser.";
  }

  // Pas d'urgence vitale, vérifier silex/glaise
  const silexStock = rb.silex?.stock || 0;
  const glaiseStock = rb.glaise?.stock || 0;

  if (silexStock > 80 && glaiseStock > 80) {
    // Les deux dépassent le seuil, choisir celui avec le stock le plus élevé
    if (silexStock >= glaiseStock) {
      return "Tes stocks de silex s'accumulent. C'est une roche dure, tranchante, que tes artisans connaissent. Qu'en fait ton peuple ?";
    } else {
      return "La glaise s'entasse dans tes entrepôts, souple et malléable. Tes potiers, tes bâtisseurs pourraient en faire usage. Qu'en décides-tu ?";
    }
  } else if (silexStock > 80) {
    return "Tes stocks de silex s'accumulent. C'est une roche dure, tranchante, que tes artisans connaissent. Qu'en fait ton peuple ?";
  } else if (glaiseStock > 80) {
    return "La glaise s'entasse dans tes entrepôts, souple et malléable. Tes potiers, tes bâtisseurs pourraient en faire usage. Qu'en décides-tu ?";
  }

  // Vérifier les stocks de peaux et os
  if (peauxStock > 50 && osStock > 50) {
    // Les deux dépassent le seuil, choisir celui avec le stock le plus élevé
    if (peauxStock >= osStock) {
      return "Des peaux s'accumulent dans tes réserves, souples et résistantes. Tes artisans les regardent avec intérêt. Qu'en fais-tu ?";
    } else {
      return "Des os s'entassent depuis la dernière chasse. Solides, légers, tranchants selon la taille. Qu'en fait ton peuple ?";
    }
  } else if (peauxStock > 50) {
    return "Des peaux s'accumulent dans tes réserves, souples et résistantes. Tes artisans les regardent avec intérêt. Qu'en fais-tu ?";
  } else if (osStock > 50) {
    return "Des os s'entassent depuis la dernière chasse. Solides, légers, tranchants selon la taille. Qu'en fait ton peuple ?";
  }

  // Aucun déclencheur spécial
  return "Analyse la situation selon tes valeurs et tes instincts. Tu es libre : construire, explorer, déclarer la guerre, créer de l'art, réorganiser.";
}

// ─── Construction du prompt (3 couches) ───────────────────────────────────────

const DEFAULT_MEMOIRE = {
  projet_principal:     'Établir les premières structures de survie.',
  posture_diplomatique: 'Le monde autour est inconnu. Nous restons sur nos gardes.',
  inquietude_majeure:   'Nous ne savons pas ce qui nous entoure.',
};

function buildPrompt(ctx) {
  const memoire = ctx.memoire || DEFAULT_MEMOIRE;

  const enCours = (ctx.active_processes || []).length > 0
    ? ctx.active_processes.map(p => `  - ${p.type} : "${p.target}" (${p.progress}/${p.max_ticks} mois, ${p.workers || 0} pers.)`).join('\n')
    : '';
  const processusSection = (ctx.active_processes || []).length > 0
    ? `**Processus en cours :**\n${enCours}`
    : '';

  const existantes = (ctx.structures || []).map(s => s.name);
  const structLines = (ctx.structures || []).map(s => {
    const roleTag = s.role ? ` [${s.role}${s.capacity ? ', cap:'+s.capacity : ''}]` : '';
    const wTag = s.workers > 0 ? ` — ${s.workers} travailleurs` : '';
    return `  - ${s.name}${roleTag}${wTag}`;
  });
  const constructionsEnCours = (ctx.active_processes || []).filter(p => p.type === 'construction');
  const chantierNote = constructionsEnCours.length >= 2
    ? `\n⚠️ Tu as déjà ${constructionsEnCours.length} chantiers actifs — tu NE PEUX PAS lancer d'autres constructions.`
    : constructionsEnCours.length === 1
      ? `\n(1 chantier en cours — 1 de plus maximum)`
      : '';
  const structNote = existantes.length > 0
    ? `Constructions existantes (NE PAS RECONSTRUIRE CE QUI EXISTE DÉJÀ) :\n${structLines.join('\n')}${chantierNote}`
    : `(aucune construction)${chantierNote}`;

  const reliquesText = (ctx.reliques_decouvertes || []).length > 0 ? getTexteReliques(ctx) : '';
  const conseqText = getTexteConsequencesReliques(ctx);
  const animauxText = (ctx.animal_groups || []).length > 0 ? getTexteAnimaux(ctx) : '';
  const rapportEclaireurs = getTexteExploration(ctx) +
    (animauxText ? '\n' + animauxText : '') +
    (reliquesText ? '\n' + reliquesText : '') +
    (conseqText ? '\n' + conseqText : '');
  return `${getRoleIntro(ctx)}


---

#### COUCHE 1 : TON IDENTITÉ ET TA PSYCHOLOGIE

${ctx.description ? ctx.description + '\n' : ''}Valeurs fondamentales : ${(ctx.valeurs || []).join(', ')}.
Gouvernement : ${ctx.gouvernement}.

Ton peuple perçoit le monde à travers ces prismes :

1. **Instinct de Survie :** ${getJaugeSecurite(ctx)}
2. **Instinct face à l'Inconnu :** ${getJaugeOuverture(ctx)}
3. **Instinct de Statut :** ${getJaugeFierte(ctx)}

---

#### COUCHE 2 : L'ÉTAT DE TON MONDE

**Saison : ${ctx.month_name || 'Juin'}, An ${ctx.year || 1} (${ctx.season || 'ete'})**

**Ta Mémoire (mois dernier) :**
- Projet : ${memoire.projet_principal}
- Diplomatie : ${memoire.posture_diplomatique}
- Inquiétude : ${memoire.inquietude_majeure}
Tu peux poursuivre ce cap, l'adapter ou l'abandonner si une urgence l'exige.

**Rapport d'intendance :**
Population — ${getTextePopulation(ctx)}
Ressources — ${getTexteRessources(ctx)}
Moral — ${getTexteMoral(ctx)}

**Rapport d'éclaireurs :**
${rapportEclaireurs}

${processusSection}

**${structNote}**

---

#### COUCHE 3 : TA DÉCISION

${buildDynamicQuestion(ctx)}

Verbes disponibles pour ACTIONS_MECANIQUES :
- AFFECTER N travailleurs à [bâtiment existant ou nouvelle tâche]
- CONSTRUIRE [nom] rôle:[habitation|agriculture|militaire|defense|commerce|religieux|savoir|bois|extraction|production|maritime|surveillance|autre]
- EXPLORER direction:[nord|sud|est|ouest|nord-est|nord-ouest|sud-est|sud-ouest]
- COLONISER direction:[direction]
- ENVOYER_EMISSAIRE [nom_civ] personnes:[N]
- ESPIONNER [nom_civ] personnes:[N]
- ENVOYER_MARCHANDS [nom_civ] personnes:[N] offre:[ressource] demande:[ressource]
- CHASSER [nom du groupe animal] personnes:[N]
- DIPLOMATIE [guerre|alliance|paix|commerce] → [nom_civ]
- ABANDONNER [nom_bâtiment]
- LOI [description]
- RIEN

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :

{
  "ANALYSE_INTERNE": "Un paragraphe : comment tes valeurs et instincts réagissent à la situation, pourquoi tu choisis cette stratégie.",
  "ACTIONS_MECANIQUES": [
    "VERBE paramètres"
  ],
  "NOUVEAU_CAP_STRATEGIQUE": {
    "projet_principal": "Ton grand objectif pour les prochains mois.",
    "posture_diplomatique": "Ta vision actuelle de tes voisins.",
    "inquietude_majeure": "Le problème ou mystère que tu cherches à résoudre."
  }
}`;
}

// ─── Parser JSON ────────────────────────────────────────────────────────────────

const VERBES_VALIDES = [
  'AFFECTER', 'CONSTRUIRE', 'EXPLORER', 'COLONISER',
  'ENVOYER_MARCHANDS', 'ENVOYER_EMISSAIRE', 'ESPIONNER',
  'DEVELOPPER', 'ABANDONNER', 'REORGANISER', 'CHASSER', 'LOI', 'DIPLOMATIE', 'RIEN',
];

function parseAction(actionStr) {
  const upper = actionStr.toUpperCase();
  const verbe = VERBES_VALIDES.find(v => upper.startsWith(v));

  if (!verbe) {
    console.warn(`[LLM Parser] Verbe non reconnu : "${actionStr.slice(0, 60)}"`);
    return { type: 'RIEN', raw: actionStr, parametres: '' };
  }

  const parametres = actionStr.slice(verbe.length).trim();
  const action = { type: verbe, raw: actionStr, parametres };

  if (verbe === 'CONSTRUIRE') {
    const roleMatch = parametres.match(/r[oô]le\s*:\s*(\w+)/i);
    if (roleMatch) action.role = roleMatch[1].toLowerCase();
    const capMatch = parametres.match(/capacit[eé]\s*:\s*(\d+)/i);
    if (capMatch) action.capacity = parseInt(capMatch[1]);
    const nomRaw = parametres
      .replace(/r[oô]le\s*:\s*\w+/gi, '')
      .replace(/capacit[eé]\s*:\s*\d+/gi, '')
      .trim();
    action.nomStructure = nomRaw
      .split(/\s+(?:sur|à|case|dans)\s+/i)[0]
      .replace(/_/g, ' ')
      .trim();
  }

  if (verbe === 'AFFECTER') {
    const nbMatch = parametres.match(/(\d+)/);
    if (nbMatch) action.nombre = parseInt(nbMatch[1]);
    const tacheMatch = parametres.match(/\d+\s+(?:travailleurs?\s+)?(?:à|vers|pour|sur|→|->)\s+(.+)/i);
    action.tache = tacheMatch
      ? tacheMatch[1].trim()
      : parametres.replace(/^\d+\s+(?:travailleurs?\s+)?/i, '').trim();
  }

  if (verbe === 'CHASSER') {
    action.cible = parametres.match(/^([^,\(]+)/)?.[1]?.trim();
    action.nombre = parseInt(parametres.match(/personnes\s*:\s*(\d+)/i)?.[1]) || 5;
  }

  if (verbe === 'EXPLORER') {
    const dirMatch = parametres.match(/direction\s*:\s*([^\s,]+)/i)
      || parametres.match(/(nord[-_]est|nord[-_]ouest|sud[-_]est|sud[-_]ouest|nord|sud|est|ouest)/i);
    if (dirMatch) action.direction = dirMatch[1].toLowerCase().replace('_', '-');
  }

  return action;
}

function parseLLMResponse(text) {
  const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { analyseInterne: '', parsedActions: [], nouveauCap: null, parseError: 'Aucun JSON trouvé' };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { analyseInterne: '', parsedActions: [], nouveauCap: null, parseError: `JSON invalide : ${e.message}` };
  }

  const analyseInterne = typeof parsed.ANALYSE_INTERNE === 'string' ? parsed.ANALYSE_INTERNE : '';

  const parsedActions = Array.isArray(parsed.ACTIONS_MECANIQUES)
    ? parsed.ACTIONS_MECANIQUES
        .filter(a => typeof a === 'string' && a.trim().length > 0)
        .map(a => parseAction(a.trim()))
    : [];

  let nouveauCap = null;
  const cap = parsed.NOUVEAU_CAP_STRATEGIQUE;
  if (cap && typeof cap === 'object') {
    nouveauCap = {
      projet_principal:     cap.projet_principal     || '',
      posture_diplomatique: cap.posture_diplomatique || '',
      inquietude_majeure:   cap.inquietude_majeure   || '',
    };
  }

  return { analyseInterne, parsedActions, nouveauCap, parseError: null };
}

// ─── Traduction vers l'ancien format texte (compat resolveEffect) ─────────────

function actionToEffetLine(action) {
  const p = action.parametres || '';

  switch (action.type) {
    case 'AFFECTER': {
      const nb    = action.nombre || 10;
      const tache = action.tache  || p || 'tâche générale';
      return `AFFECTER ${nb} personnes → ${tache}`;
    }

    case 'CONSTRUIRE': {
      const nom     = action.nomStructure || p.split(/\s+/)[0] || 'construction';
      const rolePart = action.role     ? `, rôle: ${action.role}`           : '';
      const capPart  = action.capacity ? `, capacité: ${action.capacity}`   : '';
      return `CRÉER ${nom} (personnes: 5, durée: 5${rolePart}${capPart})`;
    }

    case 'EXPLORER': {
      const dir = action.direction || 'nord';
      return `ENVOYER 5 personnes → exploration ${dir} (durée: 3, but: explorer)`;
    }

    case 'COLONISER': {
      const dirM = p.match(/direction\s*:\s*([^\s,]+)/i) || p.match(/(nord|sud|est|ouest)/i);
      const dir   = dirM ? dirM[1].toLowerCase() : 'nord';
      return `ENVOYER 30 personnes → fondation ${dir} (durée: 5, but: coloniser)`;
    }

    case 'ESPIONNER': {
      const nbM    = p.match(/personnes\s*:\s*(\d+)/i);
      const nb     = nbM ? nbM[1] : '5';
      const target = p.replace(/personnes\s*:\s*\d+/gi, '').trim();
      return `ESPIONNER ${target} (personnes: ${nb})`;
    }

    case 'ENVOYER_EMISSAIRE': {
      const nbM    = p.match(/personnes\s*:\s*(\d+)/i);
      const nb     = nbM ? nbM[1] : '3';
      const target = p.replace(/personnes\s*:\s*\d+/gi, '').trim();
      return `ENVOYER_EMISSAIRE ${target} (personnes: ${nb})`;
    }

    case 'ENVOYER_MARCHANDS': {
      const offM   = p.match(/offre\s*:\s*(\w+)/i);
      const demM   = p.match(/demande\s*:\s*(\w+)/i);
      const target = p
        .replace(/offre\s*:\s*\w+/gi, '')
        .replace(/demande\s*:\s*\w+/gi, '')
        .replace(/personnes\s*:\s*\d+/gi, '')
        .trim();
      const extras = [offM ? `offre: ${offM[1]}` : '', demM ? `demande: ${demM[1]}` : ''].filter(Boolean).join(', ');
      return `ENVOYER_MARCHANDS ${target} (${extras})`;
    }

    case 'DEVELOPPER': {
      // Affecter des travailleurs à un développement
      const nbM  = p.match(/(\d+)/);
      const nb   = nbM ? parseInt(nbM[1]) : 10;
      const task = p.replace(/\d+/g, '').replace(/travailleurs?/gi, '').trim() || 'développement';
      return `AFFECTER ${nb} personnes → ${task}`;
    }

    case 'ABANDONNER':
      return `ABANDONNER ${p}`;

    case 'LOI':
      return `LOI ${p}`;

    case 'DIPLOMATIE': {
      const parts = p.split(/\s*(?:→|->|avec|contre)\s*/i);
      const act   = parts[0]?.trim() || p;
      const tgt   = parts[1]?.trim() || '';
      return tgt ? `DIPLOMATIE ${act} → ${tgt}` : 'RIEN';
    }

    case 'CHASSER': {
      const cible = action.cible || p.split(/\s+/)[0] || '';
      const nombre = action.nombre || 5;
      return `CHASSER ${cible} (personnes: ${nombre})`;
    }

    case 'REORGANISER':
    case 'RIEN':
    default:
      return 'RIEN';
  }
}

// ─── Point d'entrée ────────────────────────────────────────────────────────────

async function decide(context) {
  // Pas de client Ollama → mock direct
  if (!ollamaChat) {
    const r = mockDecide(context);
    return { ...r, nouveauCap: null, analyseInterne: r.strategie };
  }

  try {
    const prompt = buildPrompt(context);
    const response = await Promise.race([
      ollamaChat({
        model,
        messages: [
          {
            role: 'system',
            content: 'Tu es le dirigeant d\'une civilisation vivante. Réponds UNIQUEMENT en JSON valide, sans aucun texte avant ou après. Les 3 clés obligatoires : ANALYSE_INTERNE, ACTIONS_MECANIQUES, NOUVEAU_CAP_STRATEGIQUE.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.8, num_predict: 1200 },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60000)),
    ]);

    const rawText = response.message.content.trim();
    console.log('[OLLAMA CIV RAW]', rawText.slice(0, 300));

    const { analyseInterne, parsedActions, nouveauCap, parseError } = parseLLMResponse(rawText);

    if (parseError) {
      console.warn(`[LLM Parser] ${parseError} — fallback mock`);
      const r = mockDecide(context);
      return { ...r, nouveauCap: null, analyseInterne: r.strategie };
    }

    const effets_text = parsedActions.map(a => actionToEffetLine(a)).join('\n') || 'RIEN';
    const actions     = parsedActions.map(a => a.type);
    console.log('[LLM] Actions parsées:', actions.join(', ') || 'RIEN');

    return {
      strategie:    analyseInterne,
      effets_text,
      actions:      actions.length ? actions : ['RIEN'],
      raison:       analyseInterne,
      nouveauCap,
      analyseInterne,
    };
  } catch (err) {
    console.warn(`Ollama civ → mock (${err.message})`);
    const r = mockDecide(context);
    return { ...r, nouveauCap: null, analyseInterne: r.strategie };
  }
}

module.exports = { init, decide };
