// civPromptVariants.js — 9 variants de prompt (V1-V9). V0 = baseline dans chaque LLM file.
'use strict';

const parseJ = (v, fb) => { try { return JSON.parse(v != null ? v : JSON.stringify(fb)); } catch { return fb; } };

// ─── Helpers communs ─────────────────────────────────────────────────────────

function getFoodLine(ctx) {
  const rb = ctx.resourceBilan || {};
  const food = rb.nourriture || {};
  const stock = food.stock || 0;
  const balance = food.balance ?? 0;
  const famine = ctx.food_famine_in;
  if (famine != null && famine < 5) return `🍞 Nourriture : ${stock} (famine dans ${famine} mois !)`;
  if (balance < 0) return `🍞 Nourriture : ${stock} (bilan : ${balance}/mois)`;
  return `🍞 Nourriture : ${stock} (bilan : +${balance}/mois)`;
}

function getResourceSummary(ctx) {
  const rb = ctx.resourceBilan || {};
  const lines = [];
  const groups = {
    '🍞 Vivres': ['nourriture'],
    '🪵 Matières': ['bois', 'pierre', 'glaise'],
    '⚙️ Minéraux': ['silex', 'cuivre', 'etain', 'fer', 'or', 'charbon'],
    '🦌 Chasse': ['peaux', 'os'],
  };
  for (const [label, keys] of Object.entries(groups)) {
    const parts = keys
      .filter(k => rb[k]?.stock > 0 || k === 'nourriture')
      .map(k => {
        const v = rb[k] || { stock: 0, balance: 0 };
        return `${k}:${v.stock}${v.balance !== 0 ? `(${v.balance >= 0 ? '+' : ''}${v.balance})` : ''}`;
      });
    if (parts.length) lines.push(`${label} — ${parts.join(' ')}`);
  }
  return lines.join('\n') || '(aucune ressource)';
}

function getUrgentFacts(ctx) {
  const facts = [];
  if ((ctx.homeless_deaths || 0) > 0) facts.push(`${ctx.homeless_deaths} personnes mortes de froid ce mois-ci.`);
  if ((ctx.homeless || 0) > 0) facts.push(`${ctx.homeless} personnes dorment dehors.`);
  if (ctx.food_famine_in != null && ctx.food_famine_in < 10)
    facts.push(`Les réserves alimentaires s'épuisent dans ${ctx.food_famine_in} mois.`);
  if ((ctx.moral || 70) < 30) facts.push(`Le moral est en chute libre (${ctx.moral}/100).`);
  return facts;
}

function getActiveProcessesShort(ctx) {
  return (ctx.active_processes || [])
    .map(p => `${p.target} (${p.progress}/${p.max_ticks} mois, ${p.workers || 0} pers.)`)
    .join(', ') || 'aucun';
}

function getStructuresShort(ctx) {
  return (ctx.structures || []).map(s => s.name).join(', ') || 'aucune';
}

function getFrustrationLines(ctx) {
  const ft = ctx.frustration_ticks || {};
  return Object.entries(ft)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([val, ticks]) => {
      if (ticks >= 20) return `💀 CRISE "${val}" — ${ticks} mois`;
      if (ticks >= 10) return `🔥 TENSION "${val}" — ${ticks} mois`;
      if (ticks >= 5)  return `⚠️ Pression "${val}" — ${ticks} mois`;
      return null;
    })
    .filter(Boolean);
}

function getNeighborsSummary(ctx) {
  const ns = ctx.neighbors || [];
  if (!ns.length) return 'Aucun voisin connu.';
  return ns.map(n => `${n.nom} (${n.relation}, puissance:${n.military_power})`).join(' | ');
}

function getMemoryShort(ctx) {
  const m = parseJ(ctx.civ_memory, {});
  const lines = [];
  if (m.identite?.length)   lines.push(`Identité : ${m.identite[m.identite.length - 1]}`);
  if (m.histoire?.length)   lines.push(`Histoire : ${m.histoire[m.histoire.length - 1]}`);
  if (m.diplomatie?.length) lines.push(`Diplomatie : ${m.diplomatie[m.diplomatie.length - 1]}`);
  if (m.pressions?.length)  lines.push(`Pression : ${m.pressions[m.pressions.length - 1]}`);
  return lines.join('\n') || '(aucune mémoire)';
}

// ─── Helpers pour V2/V3 (prompts narratifs) ──────────────────────────────────

const TENSION_LATENTE = {
  expansion:      "posséder davantage pour ne plus jamais manquer",
  commerce:       "être reconnu par ceux qui refusent de traiter",
  connaissance:   "comprendre ce qu'aucun autre ne comprend",
  guerre:         "que la force seule décide, une fois pour toutes",
  spiritualite:   "trouver un sens là où il n'y en a peut-être aucun",
  isolationnisme: "être laissé en paix, définitivement",
  liberte:        "agir sans jamais avoir à se justifier",
  ordre:          "que tout soit à sa place et que rien ne déraille",
  survie:         "ne plus jamais avoir à compter les réserves",
  exploration:    "voir ce qu'aucun œil n'a encore vu",
  art:            "créer quelque chose qui survive aux guerres et au temps",
  technologie:    "maîtriser les forces du monde plutôt que les subir",
};

function getTensionLatente(ctx) {
  const ft = ctx.frustration_ticks || {};
  const valeurs = ctx.valeurs || [];
  // Prendre la valeur la plus frustrée, sinon la première valeur
  const sorted = valeurs.filter(v => ft[v] > 0).sort((a, b) => (ft[b] || 0) - (ft[a] || 0));
  const val = sorted[0] || valeurs[0] || 'survie';
  return TENSION_LATENTE[val] || "traverser ce mois sans perdre personne";
}

function getTraumaLine(ctx) {
  const mem = parseJ(ctx.civ_memory, {});
  const histoire = mem.histoire || [];
  const diplomatie = mem.diplomatie || [];
  const entry = histoire[histoire.length - 1] || diplomatie[diplomatie.length - 1];
  if (!entry) return null;
  return entry;
}

function getMystere(ctx) {
  const lc = ctx.last_consequences || [];
  const relique = lc.find(c => c.type === 'relique_incomprise');
  if (relique) return `Objet inconnu rapporté par les éclaireurs : "${relique.nom || 'artefact mystérieux'}". Personne ne comprend à quoi il sert.`;
  if ((ctx.territory_count || 0) < 20) return "Le monde au-delà du territoire reste entièrement inconnu.";
  if (!(ctx.neighbors || []).length) return "Aucune civilisation n'a encore été rencontrée. Sommes-nous seuls ?";
  return null;
}

function getSouvenirRecent(ctx) {
  const lc = ctx.last_consequences || [];
  const last = [...lc].reverse().find(c => c.description);
  return last?.description || null;
}

function getTraumaActif(ctx) {
  const ft = ctx.frustration_ticks || {};
  const sorted = Object.entries(ft)
    .filter(([, v]) => v >= 5)
    .sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return null;
  return { valeur: sorted[0][0], ticks: sorted[0][1] };
}

// ─── FORMAT INSTRUCTION (commun, appendé par chaque LLM file) ───────────────
// (voir les constantes FORMAT_OLLAMA / FORMAT_GEMINI dans chaque LLM file)

// ─── VARIANT BUILDERS ────────────────────────────────────────────────────────

function buildV1_Minimal(ctx) {
  const ft = getFrustrationLines(ctx);
  return `Tu es ${ctx.nom}, ${ctx.gouvernement}.
Valeurs : ${(ctx.valeurs || []).join(', ')}.

${ctx.month_name || 'Juin'}, An ${ctx.year || 1}.

ÉTAT :
Population : ${ctx.population || 0} (${ctx.free_workforce || 0} libres, tendance : ${ctx.population_trend || '?'})
${getFoodLine(ctx)}
Moral : ${ctx.moral || 50}/100
Armée : ${ctx.army_soldiers || 0} soldats
Chantiers : ${getActiveProcessesShort(ctx)}
Constructions : ${getStructuresShort(ctx)}
Voisins : ${getNeighborsSummary(ctx)}
${ft.length ? '\n' + ft.join('\n') : ''}

${getUrgentFacts(ctx).join(' ') || 'Rien d\'urgent ce mois.'}

Que décides-tu ?`;
}

function buildV2_Psychologique(ctx) {
  const trauma = getTraumaLine(ctx);
  const mystere = getMystere(ctx);
  const souvenirRecent = getSouvenirRecent(ctx);
  const tensionLatente = getTensionLatente(ctx);
  const traumaActif = getTraumaActif(ctx);
  const urgents = getUrgentFacts(ctx);

  const traumaSection = trauma
    ? `— SOUVENIR MARQUANT : "${trauma}"`
    : `— FONDATION : "Votre peuple vient de poser ses premières pierres."`;
  const mystereSection = mystere
    ? `— MYSTÈRE : "${mystere}"`
    : '';
  const souvenirSection = souvenirRecent
    ? `— CE MOIS : "${souvenirRecent}"`
    : '';
  const criseSection = traumaActif
    ? (traumaActif.ticks >= 20
        ? `\n⚡ "${traumaActif.valeur}" bafouée depuis ${traumaActif.ticks} mois — ton peuple est au bord.`
        : `\n🔥 "${traumaActif.valeur}" sous pression depuis ${traumaActif.ticks} mois.`)
    : '';

  return `Tu es ${ctx.nom}, ${ctx.gouvernement}.
${ctx.description || ''}

Tu n'as pas à gagner. Tu as à exister et traverser ce mois.

---

CE QUE TON PEUPLE PORTE :
${traumaSection}
${mystereSection ? mystereSection + '\n' : ''}${souvenirSection ? souvenirSection + '\n' : ''}
QUI TU ES :
Valeurs : ${(ctx.valeurs || []).join(', ')}
Ce que ton peuple désire sans se l'avouer : ${tensionLatente}${criseSection}

---

TA RÉALITÉ CE MOIS :
Saison : ${ctx.month_name || 'Juin'}, An ${ctx.year || 1} — ${ctx.season || 'été'}

${urgents.length ? '⚠️ URGENCES :\n' + urgents.map(f => `  ${f}`).join('\n') + '\n' : ''}
${getResourceSummary(ctx)}
Population : ${ctx.free_workforce || 0} libres / ${ctx.population || 0} total — ${ctx.population_trend || '?'}
Moral : ${ctx.moral || 50}/100 — ${ctx.moralLabel || ''}
Chantiers : ${getActiveProcessesShort(ctx)}
Constructions : ${getStructuresShort(ctx)}
Armée : ${ctx.army_soldiers || 0} soldats — puissance ${ctx.army_power || 0}

Ce que tu n'oublies pas du mois dernier :
${getMemoryShort(ctx)}

Voisins : ${getNeighborsSummary(ctx)}

---

Tu prends des décisions pour les 30 prochains jours. Pas plus.
Raconte ce que tu décides, pourquoi, avec quels moyens et quelles personnes.`;
}

function buildV3_Corps(ctx) {
  const urgents = getUrgentFacts(ctx);
  const frustLines = getFrustrationLines(ctx);
  const traumaActif = getTraumaActif(ctx);
  const tensionLatente = getTensionLatente(ctx);

  const criseBlock = frustLines.length
    ? frustLines.join('\n')
    : '';

  return `Tu es ${ctx.nom}, ${ctx.gouvernement}.
${ctx.description || ''}

---

TA RÉALITÉ CE MOIS :
Saison : ${ctx.month_name || 'Juin'}, An ${ctx.year || 1} — ${ctx.season || 'été'}

⚠️ CE QUI EST DANS LES CORPS DE TON PEUPLE :
${urgents.length ? urgents.map(f => `  ${f}`).join('\n') : '  Ton peuple survit. Pour l\'instant.'}
Ces faits sont dans les corps de ton peuple, pas dans un rapport.

${getResourceSummary(ctx)}
Population : ${ctx.free_workforce || 0} libres / ${ctx.population || 0} — ${ctx.population_trend || '?'}
Moral : ${ctx.moral || 50}/100 — ${ctx.moralLabel || ''}${criseBlock ? '\n' + criseBlock : ''}
Chantiers : ${getActiveProcessesShort(ctx)} — pas de nouveau chantier si 2 actifs.
Constructions : ${getStructuresShort(ctx)}
Armée : ${ctx.army_soldiers || 0} soldats — puissance ${ctx.army_power || 0}

Rapport d'éclaireurs :
${getNeighborsSummary(ctx)}

Ce que tu n'oublies pas du mois dernier :
${getMemoryShort(ctx)}

---

QUI TU ES :
Valeurs : ${(ctx.valeurs || []).join(', ')}
Gouvernement : ${ctx.gouvernement}
${traumaActif && traumaActif.ticks >= 10 ? `⚡ CRISE — "${traumaActif.valeur}" bafouée depuis ${traumaActif.ticks} mois.` : ''}
${traumaActif && traumaActif.ticks >= 5 && traumaActif.ticks < 10 ? `🔥 TENSION — "${traumaActif.valeur}" sous pression depuis ${traumaActif.ticks} mois.` : ''}

Ton peuple désire sans se l'avouer : ${tensionLatente}

---

CE QUE TON PEUPLE PORTE :
${getTraumaLine(ctx) ? `— MÉMOIRE : "${getTraumaLine(ctx)}"` : '— FONDATION : première génération, pas encore de cicatrices.'}
${getMystere(ctx) ? `— MYSTÈRE : "${getMystere(ctx)}"` : ''}
${getSouvenirRecent(ctx) ? `— CE MOIS : "${getSouvenirRecent(ctx)}"` : ''}`;
}

function buildV4_UrgencePure(ctx) {
  const urgents = getUrgentFacts(ctx);
  const frustLines = getFrustrationLines(ctx);
  const rb = ctx.resourceBilan || {};
  const foodBalance = rb.nourriture?.balance ?? 0;
  const problems = [...urgents, ...frustLines];

  // Ajouter les problèmes de ressources
  if (foodBalance < -10) problems.push(`Production alimentaire insuffisante (bilan : ${foodBalance}/mois).`);
  if ((ctx.army_soldiers || 0) === 0 && (ctx.neighbors || []).length > 0)
    problems.push("Armée inexistante face à des voisins connus.");
  if (!(ctx.structures || []).length)
    problems.push("Aucune construction — ton peuple vit à l'air libre.");

  return `Tu es ${ctx.nom} (${ctx.gouvernement}).
${ctx.month_name || 'Juin'}, An ${ctx.year || 1}.

${problems.length
  ? 'CE QUI NE VA PAS :\n' + problems.map(p => `  — ${p}`).join('\n')
  : 'Ton peuple survit. Pour l\'instant. Rien d\'urgent — mais l\'inaction a son propre prix.'}

Population : ${ctx.population || 0} (${ctx.free_workforce || 0} libres)
${getFoodLine(ctx)}
Voisins : ${getNeighborsSummary(ctx)}
Mémoire : ${ctx.memoire?.projet_principal || 'aucune'}

Que fais-tu ?`;
}

function buildV5_Geopolitique(ctx) {
  const ns = ctx.neighbors || [];
  const lc = ctx.last_consequences || [];
  const combats = lc.filter(c => c.type === 'combat');
  const contacts = lc.filter(c => c.type === 'premier_contact');
  const urgents = getUrgentFacts(ctx);

  const relationsBlock = ns.length
    ? ns.map(n => `  ▸ ${n.nom} : ${n.relation}, population ~${n.population || '?'}, puissance ${n.military_power || 0}`).join('\n')
    : '  Aucun voisin connu. Les horizons sont vides.';

  const eventsBlock = [
    ...combats.map(c => `  ⚔️ ${c.description}`),
    ...contacts.map(c => `  🤝 Premier contact : ${c.nom}`),
  ].join('\n') || '  Aucun événement diplomatique ce mois.';

  return `Tu es ${ctx.nom} (${ctx.gouvernement}).
Valeurs : ${(ctx.valeurs || []).join(', ')}.
${ctx.month_name || 'Juin'}, An ${ctx.year || 1} — ${ctx.season || 'été'}

${urgents.length ? '⚠️ URGENCES : ' + urgents.join(' ') + '\n' : ''}

SITUATION GÉOPOLITIQUE :
Territoire : ${ctx.territory_count || 0} cases
Armée : ${ctx.army_soldiers || 0} soldats, puissance ${ctx.army_power || 0}
Voisins connus :
${relationsBlock}

Événements diplomatiques récents :
${eventsBlock}

ÉTAT INTÉRIEUR :
Population : ${ctx.population || 0} (${ctx.free_workforce || 0} libres)
${getFoodLine(ctx)}
Moral : ${ctx.moral || 50}/100 — ${(getFrustrationLines(ctx).join(' ') || 'stable')}

Mémoire stratégique :
${getMemoryShort(ctx)}

Que décides-tu sur le plan géopolitique ce mois ?`;
}

function buildV6_Economique(ctx) {
  const rb = ctx.resourceBilan || {};
  const urgents = getUrgentFacts(ctx);

  const resBlock = Object.entries(rb)
    .filter(([, v]) => v.stock > 0 || v.production > 0)
    .map(([res, v]) => {
      const trend = v.balance > 0 ? `↑+${v.balance}` : v.balance < 0 ? `↓${v.balance}` : '→0';
      return `  ${res.padEnd(12)} stock:${String(v.stock).padStart(5)}  prod:+${v.production}  conso:-${v.consumption}  bilan:${trend}`;
    })
    .join('\n') || '  (aucune production)';

  const workerBlock = (ctx.structures || [])
    .map(s => `  ${s.name} — ${s.workers || 0} travailleurs`)
    .join('\n') || '  (aucune structure)';

  const biomeBlock = (ctx.territory_biomes || []).slice(0, 5)
    .map(b => `  ${b.biome} (${b.count} cases) → ${b.produces}`)
    .join('\n') || '  (inconnu)';

  return `Tu es ${ctx.nom} (${ctx.gouvernement}).
Valeurs : ${(ctx.valeurs || []).join(', ')}.
${ctx.month_name || 'Juin'}, An ${ctx.year || 1}

${urgents.length ? '⚠️ URGENCES : ' + urgents.join(' ') + '\n' : ''}

BILAN ÉCONOMIQUE :
${resBlock}

MAIN-D'ŒUVRE :
Population : ${ctx.population || 0} total, ${ctx.free_workforce || 0} libres
${workerBlock}

POTENTIEL DU TERRITOIRE (${ctx.territory_count || 0} cases) :
${biomeBlock}

CHANTIERS EN COURS :
${getActiveProcessesShort(ctx)}

Voisins : ${getNeighborsSummary(ctx)}
${getMemoryShort(ctx)}

Optimise la production de ta civilisation ce mois. Que décides-tu ?`;
}

function buildV7_Chronique(ctx) {
  const urgents = getUrgentFacts(ctx);
  const trauma = getTraumaLine(ctx);
  const frustLines = getFrustrationLines(ctx);

  return `Dans les annales de ${ctx.nom}, An ${ctx.year || 1}, ${ctx.month_name || 'Juin'}.

${ctx.description || 'Un peuple dont l\'histoire commence.'}

---

Ce que les chroniqueurs ont noté ce mois :
${urgents.length ? urgents.map(f => `  — ${f}`).join('\n') : '  — Rien d\'exceptionnel. La vie suit son cours.'}
${frustLines.length ? frustLines.map(f => `  — ${f}`).join('\n') : ''}

L'état du royaume :
Population : ${ctx.population || 0} âmes (${ctx.free_workforce || 0} disponibles)
Réserves : ${getFoodLine(ctx)}
Moral du peuple : ${ctx.moral || 50}/100 (${ctx.moralLabel || ''})
Territoire : ${ctx.territory_count || 0} cases
Armée : ${ctx.army_soldiers || 0} soldats

${trauma ? 'Ce que l\'histoire retient : ' + trauma : ''}

Voisins : ${getNeighborsSummary(ctx)}

---

Tu es le dirigeant de ${ctx.nom}. Les chroniqueurs écriront ce que tu décides.
Gouvernement : ${ctx.gouvernement}. Valeurs : ${(ctx.valeurs || []).join(', ')}.

${getMemoryShort(ctx)}

Que se passera-t-il dans les annales de ce mois ?`;
}

function buildV8_ValeursTension(ctx) {
  const valeurs = ctx.valeurs || [];
  const ft = ctx.frustration_ticks || {};
  const sat = ctx.satisfactions || [];
  const urgents = getUrgentFacts(ctx);

  const TENSIONS_DESC = {
    expansion: { sat: "Votre territoire s'étend. La soif de terres est apaisée.", fru: "Vos frontières n'ont pas bougé. L'expansion est trahie." },
    commerce: { sat: "Les échanges avec l'extérieur enrichissent votre peuple.", fru: "Pas d'échanges. Le talent marchand se consume dans l'inaction." },
    connaissance: { sat: "De nouvelles connaissances ont été acquises.", fru: "Aucune découverte. L'ignorance pèse sur les esprits savants." },
    guerre: { sat: "Le combat a prouvé la valeur de votre armée.", fru: "Aucun combat. Les guerriers s'impatientent." },
    spiritualite: { sat: "Les lieux sacrés guident les âmes.", fru: "Pas de temple. Le vide spirituel érode la cohésion." },
    isolationnisme: { sat: "Aucun étranger ne trouble votre paix.", fru: "Trop de contacts extérieurs. L'intégrité est menacée." },
    liberte: { sat: "Le peuple est libre de ses choix.", fru: "Les contraintes étouffent. La liberté est bafouée." },
    ordre: { sat: "Chacun est à sa place. La société fonctionne.", fru: "Le désordre gagne. Trop de gens sont sans rôle." },
    survie: { sat: "Les greniers sont pleins. La survie est assurée.", fru: "Les réserves diminuent. La peur de mourir de faim grandit." },
    exploration: { sat: "De nouvelles terres ont été découvertes.", fru: "Le territoire stagne. L'appel de l'horizon est ignoré." },
    art: { sat: "La culture et la beauté s'épanouissent.", fru: "Aucune œuvre. L'âme créatrice souffre." },
    technologie: { sat: "De nouvelles techniques maîtrisées.", fru: "Pas d'innovation. Le retard technique inquiète." },
  };

  const valeurLines = valeurs.map(v => {
    const ticks = ft[v] || 0;
    const desc = TENSIONS_DESC[v] || { sat: `${v} satisfait.`, fru: `${v} frustré.` };
    const isSat = sat.some(s => s.toLowerCase().includes(v));
    if (isSat) return `  ✅ ${v.toUpperCase()} — ${desc.sat}`;
    if (ticks >= 20) return `  💀 ${v.toUpperCase()} (${ticks} mois) — ${desc.fru} CRISE IMMINENTE.`;
    if (ticks >= 10) return `  🔥 ${v.toUpperCase()} (${ticks} mois) — ${desc.fru}`;
    if (ticks >= 5)  return `  ⚠️ ${v.toUpperCase()} (${ticks} mois) — ${desc.fru}`;
    return `  — ${v.toUpperCase()} — neutre ce mois.`;
  });

  return `Tu es ${ctx.nom} (${ctx.gouvernement}).
${ctx.month_name || 'Juin'}, An ${ctx.year || 1}

${urgents.length ? '⚠️ URGENCES : ' + urgents.join(' ') + '\n' : ''}

CE QUE TES VALEURS EXIGENT CE MOIS :
${valeurLines.join('\n')}

CONTEXTE :
Population : ${ctx.population || 0} (${ctx.free_workforce || 0} libres) — ${ctx.population_trend || '?'}
${getFoodLine(ctx)}
Armée : ${ctx.army_soldiers || 0} soldats
Territoire : ${ctx.territory_count || 0} cases
Constructions : ${getStructuresShort(ctx)}
Voisins : ${getNeighborsSummary(ctx)}

${getMemoryShort(ctx)}

Tes valeurs dictent tes priorités. Que décides-tu ce mois ?`;
}

function buildV9_Oracle(ctx) {
  const urgents = getUrgentFacts(ctx);
  const frustLines = getFrustrationLines(ctx);
  const trauma = getTraumaLine(ctx);
  const mystere = getMystere(ctx);

  const rb = ctx.resourceBilan || {};
  const foodStock = rb.nourriture?.stock || 0;
  const foodBalance = rb.nourriture?.balance ?? 0;

  // Interprétation oraculaire des faits
  const signes = [];
  if (urgents.length) signes.push(...urgents.map(f => `Les devins voient : ${f.toLowerCase()}`));
  if (foodBalance < 0) signes.push(`Les entrailles des animaux sacrifiés présagent une pénurie. (nourriture : ${foodBalance}/mois)`);
  if ((ctx.moral || 70) < 40) signes.push(`Les cendres parlent de rébellion. Le peuple gronde sourdement.`);
  if (frustLines.length) signes.push(...frustLines.map(f => `Présage sombre : ${f}`));
  if (mystere) signes.push(`Vision obscure : ${mystere}`);
  if (!signes.length) signes.push(`Les augures sont favorables. Un mois ordinaire s'annonce.`);

  return `Tes devins ont lu les signes ce ${ctx.month_name || 'mois'}, An ${ctx.year || 1}.

Tu es ${ctx.nom}, ${ctx.gouvernement}.
Valeurs : ${(ctx.valeurs || []).join(', ')}.

---

CE QUE LES CENDRES ONT DIT :
${signes.map(s => `  — ${s}`).join('\n')}

${trauma ? `CE QUE L'HISTOIRE MURMURE :\n  "${trauma}"\n` : ''}

LA RÉALITÉ DERRIÈRE LES PRÉSAGES :
Population : ${ctx.population || 0} âmes (${ctx.free_workforce || 0} disponibles)
Réserves de nourriture : ${foodStock} (bilan : ${foodBalance >= 0 ? '+' : ''}${foodBalance}/mois)
Armée : ${ctx.army_soldiers || 0} guerriers
Territoire : ${ctx.territory_count || 0} cases
Constructions : ${getStructuresShort(ctx)}
Voisins : ${getNeighborsSummary(ctx)}

${getMemoryShort(ctx)}

---

Les dieux n'ordonnent pas. Ils montrent.
Que décides-tu pour ton peuple ce mois, ${ctx.nom} ?`;
}

// ─── Sélecteur principal ─────────────────────────────────────────────────────

const BUILDERS = {
  V1: buildV1_Minimal,
  V2: buildV2_Psychologique,
  V3: buildV3_Corps,
  V4: buildV4_UrgencePure,
  V5: buildV5_Geopolitique,
  V6: buildV6_Economique,
  V7: buildV7_Chronique,
  V8: buildV8_ValeursTension,
  V9: buildV9_Oracle,
};

function buildVariantBody(ctx, variant) {
  const builder = BUILDERS[variant];
  if (!builder) {
    console.warn(`[VARIANTS] Variant inconnu "${variant}", fallback V1`);
    return buildV1_Minimal(ctx);
  }
  return builder(ctx);
}

module.exports = { buildVariantBody };