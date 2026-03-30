# PROMPT_VARIANTS_SPEC.md — Expérience 10 variants de prompts

> Spec complète pour Roo Code. Ne pas modifier sans discussion.
> Objectif : 10 civs, chacune avec un style de prompt différent, observer leurs comportements sur 6h+.

---

## 1. ARCHITECTURE GÉNÉRALE

### Principe
- Chaque civ a une colonne `prompt_variant TEXT DEFAULT 'V0'`
- `V0` = prompt baseline actuel (inchangé dans civOllamaLLM.js et civGeminiLLM.js)
- `V1`→`V9` = nouveaux prompts dans `civPromptVariants.js`
- Les deux LLM files appellent `buildVariantBody(ctx, variant)` pour V1-V9, puis appendent leur instruction de format existante

### Nouveau fichier
`backend/src/llm/civPromptVariants.js` — exporté par les deux LLM files

### Instruction de format (identique pour tous les variants)
Copier-coller la section "verbes disponibles + JSON" depuis chaque LLM file en constante `FORMAT_OLLAMA` / `FORMAT_GEMINI`, et l'appender après le body.

---

## 2. MIGRATIONS DB

### Dans `backend/scripts/migrate.js`, ajouter ces deux blocs idempotents :

```js
// Colonne prompt_variant sur civilizations
try {
  db.prepare("ALTER TABLE civilizations ADD COLUMN prompt_variant TEXT DEFAULT 'V0'").run();
  console.log('✓ ALTER civilizations: prompt_variant');
} catch {}

// Table snapshots
db.prepare(`CREATE TABLE IF NOT EXISTS civ_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  civ_id INTEGER NOT NULL,
  prompt_variant TEXT DEFAULT 'V0',
  tick INTEGER NOT NULL,
  population INTEGER DEFAULT 0,
  moral INTEGER DEFAULT 0,
  food_stock INTEGER DEFAULT 0,
  army_soldiers INTEGER DEFAULT 0,
  territory_count INTEGER DEFAULT 0,
  buildings_count INTEGER DEFAULT 0,
  nb_wars INTEGER DEFAULT 0,
  nb_alliances INTEGER DEFAULT 0,
  frustration_max INTEGER DEFAULT 0,
  captured_at TEXT DEFAULT (datetime('now'))
)`).run();
console.log('✓ TABLE civ_snapshots');
```

---

## 3. SNAPSHOT DANS civEngine.js

### Dans `.env`, ajouter :
```
SNAPSHOT_INTERVAL_TICKS=20
TICK_INTERVAL_MS=60000
```

### Dans `civEngine.js`, à la fin du tick (après la boucle LLM, avant le broadcast), ajouter :

```js
// ═══ SNAPSHOTS (toutes les N ticks) ════════════════════════════════════════
const snapInterval = parseInt(process.env.SNAPSHOT_INTERVAL_TICKS || '20');
if (currentTick % snapInterval === 0 && currentTick > 0) {
  const snapCivs = db.prepare("SELECT * FROM civilizations WHERE world_id=? AND status='alive'").all(this.worldId);
  const insertSnap = db.prepare(`
    INSERT INTO civ_snapshots (world_id, civ_id, prompt_variant, tick, population, moral, food_stock,
      army_soldiers, territory_count, buildings_count, nb_wars, nb_alliances, frustration_max)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const snapTx = db.transaction(() => {
    for (const sc of snapCivs) {
      const res = parseJ(sc.resources, {});
      const bldgs = normalizeBuildings(sc.buildings);
      const wars = db.prepare("SELECT COUNT(*) as n FROM diplomacy WHERE world_id=? AND (civ_a_id=? OR civ_b_id=?) AND relation='guerre'").get(this.worldId, sc.id, sc.id).n;
      const allies = db.prepare("SELECT COUNT(*) as n FROM diplomacy WHERE world_id=? AND (civ_a_id=? OR civ_b_id=?) AND relation='alliance'").get(this.worldId, sc.id, sc.id).n;
      const frustTicks = parseJ(sc.frustration_ticks, {});
      const frustMax = Math.max(0, ...Object.values(frustTicks));
      insertSnap.run(
        this.worldId, sc.id, sc.prompt_variant || 'V0', currentTick,
        sc.population || 0, sc.moral || 0, res.nourriture || 0,
        sc.army_soldiers || 0, sc.territory_count || 0, bldgs.length,
        wars, allies, frustMax
      );
    }
  });
  snapTx();
  console.log(`  [SNAP] Snapshot tick ${currentTick} — ${snapCivs.length} civs`);
}
```

---

## 4. MODIFICATIONS LLM FILES

### civOllamaLLM.js

1. Ajouter en haut du fichier :
```js
const { buildVariantBody } = require('./civPromptVariants');
```

2. Renommer la fonction `buildPrompt(ctx)` existante en `buildPromptV0(ctx)` (ne pas toucher son contenu)

3. Ajouter une nouvelle `buildPrompt(ctx)` :
```js
const FORMAT_OLLAMA = `
Verbes disponibles pour ACTIONS_MECANIQUES :
- AFFECTER N travailleurs à [bâtiment existant ou nouvelle tâche]
- CONSTRUIRE [nom] rôle:[habitation|agriculture|militaire|defense|commerce|religieux|savoir|bois|extraction|production|maritime|surveillance|autre]
- EXPLORER direction:[nord|sud|est|ouest|nord-est|nord-ouest|sud-est|sud-ouest]
- COLONISER direction:[direction]
- ATTAQUER [nom_civ]
- ENVOYER_EMISSAIRE [nom_civ] personnes:[N]
- ESPIONNER [nom_civ] personnes:[N]
- ENVOYER_MARCHANDS [nom_civ] personnes:[N] offre:[ressource] demande:[ressource]
- CHASSER [nom du groupe animal] personnes:[N]
- DIPLOMATIE [alliance|paix|commerce] → [nom_civ]
- ABANDONNER [nom_bâtiment]
- LOI [description]
- RIEN

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :

{
  "ANALYSE_INTERNE": "Un paragraphe : comment tes valeurs et instincts réagissent à la situation.",
  "ACTIONS_MECANIQUES": ["VERBE paramètres"],
  "NOUVEAU_CAP_STRATEGIQUE": {
    "projet_principal": "Ton grand objectif pour les prochains mois.",
    "posture_diplomatique": "Ta vision actuelle de tes voisins.",
    "inquietude_majeure": "Le problème que tu cherches à résoudre."
  },
  "SOUHAIT": "[un besoin ou désir de ta civilisation en une phrase]"
}`;

function buildPrompt(ctx) {
  const variant = ctx.prompt_variant || 'V0';
  if (variant === 'V0') return buildPromptV0(ctx);
  return buildVariantBody(ctx, variant) + '\n\n' + FORMAT_OLLAMA;
}
```

### civGeminiLLM.js

1. Ajouter en haut du fichier :
```js
const { buildVariantBody } = require('./civPromptVariants');
```

2. Renommer `buildPrompt(ctx)` existante en `buildPromptV0(ctx)`

3. Ajouter :
```js
const FORMAT_GEMINI = `
Décris ta stratégie, puis résume en effets.

STRATÉGIE: [une phrase en français]
EFFETS:
- CRÉER [nom libre] (personnes: X, durée: Y ticks)
- AFFECTER X personnes → [tâche]
- ENVOYER X personnes → exploration [direction] (durée: Y ticks)
- MODIFIER [existant] → [changement]
- ABANDONNER [structure]
- ESPIONNER [civ cible] (personnes: X, durée: Y ticks)
- ENVOYER_EMISSAIRE [civ cible] (personnes: X, durée: Y ticks)
- ENVOYER_MARCHANDS [civ cible] (personnes: X, durée: Y ticks)
- SURVEILLER_FRONTIERE [direction] (personnes: X, permanent)
- ATTAQUER [nom_civ]
- DIPLOMATIE [alliance|paix|commerce] → [civ cible]
- LOI [description]
- RIEN
SOUHAIT: [un besoin ou désir de ta civilisation en une phrase]`;

function buildPrompt(ctx) {
  const variant = ctx.prompt_variant || 'V0';
  if (variant === 'V0') return buildPromptV0(ctx);
  return buildVariantBody(ctx, variant) + '\n\n' + FORMAT_GEMINI;
}
```

### buildCivContext dans civActionResolver.js
Ajouter `prompt_variant: civ.prompt_variant || 'V0'` dans l'objet retourné par `buildCivContext`.

---

## 5. FICHIER civPromptVariants.js (créer dans backend/src/llm/)

```js
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
  const m = ctx.memoire || {};
  return [
    m.projet_principal     ? `Projet : ${m.projet_principal}` : null,
    m.posture_diplomatique ? `Diplomatie : ${m.posture_diplomatique}` : null,
    m.inquietude_majeure   ? `Inquiétude : ${m.inquietude_majeure}` : null,
  ].filter(Boolean).join('\n');
}

// ─── Helpers pour V2/V3 (prompts narratifs) ──────────────────────────────────

const TENSION_LATENTE = {
  expansion:      "posséder davantage pour ne plus jamais manquer",
  commerce:       "être reconnu par ceux qui refusent de traiter",
  savoir:         "comprendre ce qu'aucun autre ne comprend",
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
    savoir: { sat: "De nouvelles connaissances ont été acquises.", fru: "Aucune découverte. L'ignorance pèse sur les esprits savants." },
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
```

---

## 6. MISE À JOUR civSeed.js

Remplacer `DEMO_CIVS` par ce tableau de 10 civs. Chaque civ est assignée à un variant.
Les positions sont espacées sur la carte. Adapter si la carte est plus petite.

```js
const DEMO_CIVS = [
  // V0 — Baseline Ollama (prompt actuel, référence)
  {
    nom: "Les Conquérants du Feu Sacré",
    creator_name: 'Demo', prompt_variant: 'V0',
    valeurs: ['expansion', 'guerre', 'spiritualite'],
    gouvernement: 'monarchie',
    description: 'Un peuple conquérant guidé par une foi ardente.',
    color: '#ef4444', capital_x: 30, capital_y: 20,
  },
  // V1 — Minimal
  {
    nom: "Les Nomades du Fer",
    creator_name: 'Demo', prompt_variant: 'V1',
    valeurs: ['survie', 'guerre', 'exploration'],
    gouvernement: 'tribu',
    description: 'Des errants forgés par la dureté du monde, pragmatiques et sans illusions.',
    color: '#78716c', capital_x: 55, capital_y: 20,
  },
  // V2 — Psychologique (trauma/mystère)
  {
    nom: "Les Enfants de la Terre Mère",
    creator_name: 'Demo', prompt_variant: 'V2',
    valeurs: ['spiritualite', 'survie', 'isolationnisme'],
    gouvernement: 'théocratie',
    description: 'Un peuple profondément lié à leur terre, guidé par des chamanes et des anciens.',
    color: '#22c55e', capital_x: 30, capital_y: 45,
  },
  // V3 — Corps (faits bruts)
  {
    nom: "Les Marchands de l'Aube",
    creator_name: 'Demo', prompt_variant: 'V3',
    valeurs: ['commerce', 'exploration', 'liberte'],
    gouvernement: 'republique',
    description: 'Des négociants audacieux qui ont fondé leur prospérité sur les routes commerciales.',
    color: '#f59e0b', capital_x: 55, capital_y: 45,
  },
  // V4 — Urgence pure
  {
    nom: "Les Gardiens du Mur",
    creator_name: 'Demo', prompt_variant: 'V4',
    valeurs: ['ordre', 'survie', 'guerre'],
    gouvernement: 'dictature_militaire',
    description: 'Une société militarisée née d\'une catastrophe passée, obsédée par la défense.',
    color: '#6366f1', capital_x: 15, capital_y: 32,
  },
  // V5 — Géopolitique
  {
    nom: "Le Grand Khaganat",
    creator_name: 'Demo', prompt_variant: 'V5',
    valeurs: ['expansion', 'guerre', 'ordre'],
    gouvernement: 'monarchie',
    description: 'Un empire en construction dont la diplomatie est aussi redoutable que les armées.',
    color: '#dc2626', capital_x: 68, capital_y: 32,
  },
  // V6 — Économique
  {
    nom: "Le Syndicat des Forges",
    creator_name: 'Demo', prompt_variant: 'V6',
    valeurs: ['savoir', 'commerce', 'ordre'],
    gouvernement: 'aristocratie',
    description: 'Une société d\'artisans et d\'ingénieurs gouvernée par les guildes marchandes.',
    color: '#f97316', capital_x: 15, capital_y: 55,
  },
  // V7 — Chronique
  {
    nom: "Les Érudits d'Aristos",
    creator_name: 'Demo', prompt_variant: 'V7',
    valeurs: ['savoir', 'art', 'exploration'],
    gouvernement: 'aristocratie',
    description: 'Une société où le savoir est sacré et où chaque acte est consigné dans des annales.',
    color: '#3b82f6', capital_x: 68, capital_y: 55,
  },
  // V8 — Valeurs-Tension
  {
    nom: "Les Ascètes de la Pierre",
    creator_name: 'Demo', prompt_variant: 'V8',
    valeurs: ['isolationnisme', 'spiritualite', 'art'],
    gouvernement: 'théocratie',
    description: 'Des mystiques reclus dont toute décision est pesée à l\'aune de leurs valeurs sacrées.',
    color: '#a855f7', capital_x: 40, capital_y: 55,
  },
  // V9 — Oracle
  {
    nom: "Les Mystiques des Brumes",
    creator_name: 'Demo', prompt_variant: 'V9',
    valeurs: ['spiritualite', 'savoir', 'liberte'],
    gouvernement: 'théocratie',
    description: 'Un peuple guidé par des voyants dont les prophéties façonnent chaque décision.',
    color: '#14b8a6', capital_x: 55, capital_y: 32,
  },
];
```

### Dans la boucle d'insertion de civSeed.js, ajouter `prompt_variant` :

La requête INSERT doit inclure `prompt_variant`. Ajouter la colonne dans le INSERT :
```js
const civId = db.prepare(
  'INSERT INTO civilizations (world_id, nom, creator_name, valeurs, gouvernement, description, color, capital_x, capital_y, resources, prompt_variant) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
).run(
  worldId, civData.nom, civData.creator_name,
  JSON.stringify(validatedValeurs), civData.gouvernement,
  civData.description, civData.color,
  civData.capital_x, civData.capital_y,
  JSON.stringify(INITIAL_RESOURCES),
  civData.prompt_variant || 'V0'
).lastInsertRowid;
```

---

## 7. SCRIPT analyzeVariants.js

Créer `backend/scripts/analyzeVariants.js` :

```js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { db } = require('../src/config/db');

function analyze() {
  const worlds = db.prepare("SELECT * FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").all();
  if (!worlds.length) { console.log('Aucun monde civilisations trouvé.'); return; }
  const worldId = worlds[0].id;
  const currentTick = worlds[0].tick || 0;

  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  ANALYSE DES VARIANTS — Monde ${worldId} — Tick ${currentTick} (An ${Math.floor(currentTick/12)+1})`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  const civs = db.prepare("SELECT * FROM civilizations WHERE world_id=?").all(worldId);

  for (const civ of civs) {
    const variant = civ.prompt_variant || 'V0';
    const snaps = db.prepare(
      "SELECT * FROM civ_snapshots WHERE civ_id=? ORDER BY tick ASC"
    ).all(civ.id);

    if (!snaps.length) {
      console.log(`[${variant}] ${civ.nom} — aucun snapshot encore.`);
      continue;
    }

    const first = snaps[0];
    const last  = snaps[snaps.length - 1];
    const popGrowth = last.population - first.population;
    const moralAvg  = Math.round(snaps.reduce((s, r) => s + r.moral, 0) / snaps.length);
    const maxWars   = Math.max(...snaps.map(r => r.nb_wars));
    const maxFrust  = Math.max(...snaps.map(r => r.frustration_max));
    const status    = civ.status === 'alive' ? '🟢 alive' : '💀 mort';

    console.log(`[${variant}] ${civ.nom} (${status})`);
    console.log(`  Pop : ${first.population} → ${last.population} (${popGrowth >= 0 ? '+' : ''}${popGrowth})`);
    console.log(`  Moral moyen : ${moralAvg}/100`);
    console.log(`  Max guerres simultanées : ${maxWars}`);
    console.log(`  Max frustration : ${maxFrust} ticks`);
    console.log(`  Bâtiments (dernier snap) : ${last.buildings_count}`);
    console.log(`  Territoire (dernier snap) : ${last.territory_count} cases`);
    console.log(`  Snapshots : ${snaps.length} (tous les ${process.env.SNAPSHOT_INTERVAL_TICKS || 20} ticks)`);
    console.log('');
  }

  // Classement par pop finale
  const ranked = civs
    .map(c => {
      const last = db.prepare("SELECT * FROM civ_snapshots WHERE civ_id=? ORDER BY tick DESC LIMIT 1").get(c.id);
      return { nom: c.nom, variant: c.prompt_variant || 'V0', status: c.status, pop: last?.population || 0, moral: last?.moral || 0 };
    })
    .sort((a, b) => b.pop - a.pop);

  console.log('CLASSEMENT FINAL :');
  ranked.forEach((r, i) => {
    console.log(`  ${i + 1}. [${r.variant}] ${r.nom} — pop:${r.pop} moral:${r.moral} ${r.status === 'alive' ? '🟢' : '💀'}`);
  });
}

analyze();
```

Usage : `node backend/scripts/analyzeVariants.js`

---

## 8. ORDRE D'EXÉCUTION POUR ROO CODE

1. **migrate.js** — ajouter les deux blocs DB (prompt_variant + civ_snapshots)
2. **civPromptVariants.js** — créer le fichier complet (section 5)
3. **civOllamaLLM.js** — renommer buildPrompt → buildPromptV0, ajouter import + nouvelle buildPrompt
4. **civGeminiLLM.js** — idem
5. **civActionResolver.js** — ajouter `prompt_variant` dans buildCivContext
6. **civEngine.js** — ajouter le bloc snapshot (section 3)
7. **civSeed.js** — remplacer DEMO_CIVS + ajouter prompt_variant dans INSERT
8. **.env** — TICK_INTERVAL_MS=60000, SNAPSHOT_INTERVAL_TICKS=20
9. **analyzeVariants.js** — créer le script (section 7)
