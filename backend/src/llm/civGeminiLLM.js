// Civ LLM — Gemini 2.0 Flash (fallback : civMockLLM)
const { decide: mockDecide } = require('./civMockLLM');

let model = null;

function init() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('⚠️  GEMINI_API_KEY absent — décisions civ rule-based (mock)');
    return false;
  }
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({
      model: process.env.LLM_MODEL || 'gemini-2.0-flash',
      generationConfig: { maxOutputTokens: 300, temperature: 0.9 },
    });
    console.log(`✓ Gemini (Civilisations) initialisé (${process.env.LLM_MODEL || 'gemini-2.0-flash'})`);
    return true;
  } catch (err) {
    console.warn(`⚠️  Gemini init échoué: ${err.message} — mock activé`);
    return false;
  }
}

const RES_EMOJI = {
  nourriture: '🍞', bois: '🪵', pierre: '🪨', glaise: '🧱',
  silex: '🔩', sable: '⏳', sel: '🧂', cuivre: '🟤',
  etain: '⬜', fer: '⚙️', or: '🟡', charbon: '🖤',
  peaux: '🦌', os: '🦴',
};

function formatMemory(memory, ctx) {
  if (!memory) return '';
  const mem = typeof memory === 'string' ? JSON.parse(memory) : memory;

  // Chargement sélectif
  const domains = [];
  domains.push({ key: 'identite',   label: 'Identité',   entries: mem.identite   || [] });
  domains.push({ key: 'savoir',     label: 'Savoir',     entries: mem.savoir     || [] });
  domains.push({ key: 'histoire',   label: 'Histoire',   entries: mem.histoire   || [] });

  // Diplomatie : seulement si voisins connus
  if ((ctx._known_count || 0) > 0 || (mem.diplomatie || []).length > 0) {
    domains.push({ key: 'diplomatie', label: 'Diplomatie', entries: mem.diplomatie || [] });
  }

  // Pressions : seulement si entrées non vides
  if ((mem.pressions || []).length > 0) {
    domains.push({ key: 'pressions', label: 'Pressions',  entries: mem.pressions  || [] });
  }

  const lines = domains
    .filter(d => d.entries.length > 0)
    .map(d => `  [${d.label}] ${d.entries.join(' | ')}`);

  return lines.length ? `MÉMOIRE :\n${lines.join('\n')}` : '';
}

function getRelicsPossessedText(ctx) {
  const relics = ctx.relics || [];
  const nonUtilisees = relics.filter(r => r.taken === 1 && r.used === 0);
  if (nonUtilisees.length === 0) return '';
  const lines = [];
  lines.push('OBJETS EN VOTRE POSSESSION :');
  for (const r of nonUtilisees) {
    lines.push(`- ${r.name} : ${r.description}`);
  }
  return lines.join('\n');
}

function buildPrompt(ctx) {
  const valeurs = (ctx.valeurs || []).join(', ') || 'aucune';

  // ── Moral avec frustrations/satisfactions ──
  const moralLabel = ctx.moralLabel || 'neutre';
  const moralLine  = `MORAL : ${ctx.moral || 50}/100 (${moralLabel})`;
  const satisfLines = (ctx.satisfactions || []).map(s => `  ✅ ${s}`).join('\n');
  const frustLines = (ctx.frustrations || []).map(f => {
    const tickMatch = f.match(/tick (\d+)/);
    const ticks = tickMatch ? parseInt(tickMatch[1]) : 0;
    if (ticks >= 20) return `  💀 CRISE (${ticks} mois) — ${f.replace(/\(tick \d+\)/, '').trim()}`;
    if (ticks >= 10) return `  🔥 TENSION PROFONDE (${ticks} mois) — ${f.replace(/\(tick \d+\)/, '').trim()}`;
    if (ticks >= 5)  return `  ⚠️ TENSION (${ticks} mois) — ${f.replace(/\(tick \d+\)/, '').trim()}`;
    return `  — ${f}`;
  }).join('\n');
  const urgentFrusts = (ctx.frustrations || []).filter(f => {
    const m = f.match(/tick (\d+)/); return m && parseInt(m[1]) >= 10;
  });
  const urgentBlock = urgentFrusts.length
    ? `\n⚡ PRESSIONS INTERNES URGENTES :\n${urgentFrusts.map(f => {
        const t = parseInt(f.match(/tick (\d+)/)[1]);
        return t >= 20 ? `💀 ${f}` : `🔥 ${f}`;
      }).join('\n')}\n`
    : '';
  const moralAlert  = '';
  const moralBlock  = [moralLine, satisfLines, frustLines, moralAlert].filter(Boolean).join('\n');

  // ── Ressources ──
  const rb = ctx.resourceBilan || {};
  const resLines = Object.entries(rb)
    .filter(([res, v]) => v.stock > 0 || v.production > 0 || res === 'peaux' || res === 'os')
    .map(([res, v]) => {
      const icon   = RES_EMOJI[res] || '📦';
      const detail = v.production > 0 || v.consumption > 0
        ? ` (prod:+${v.production}, conso:-${v.consumption}, bilan:${v.balance >= 0 ? '+' : ''}${v.balance})`
        : '';
      const warn   = res === 'nourriture' && ctx.food_famine_in != null
        ? ` (épuisement dans ${ctx.food_famine_in} mois)` : '';
      return `  ${icon} ${res.charAt(0).toUpperCase() + res.slice(1)} : ${v.stock}${detail}${warn}`;
    })
    .join('\n') || '  (aucune ressource — les personnes libres font de la cueillette de subsistance)';

  // ── Biomes ──
  const biomeLines = (ctx.territory_biomes || []).slice(0, 5)
    .map(b => `  - ${b.biome} (${b.count} cases) : ${b.produces}`)
    .join('\n') || '  (aucun)';

  // ── Structures ──
  const structList = (ctx.structures || []).length
    ? ctx.structures.map(s => {
        const prod = s.prod_per_tick > 0 ? ` → +${s.prod_per_tick} ${s.production}/tick` : '';
        return `  🏠 ${s.name} (${s.workers} pers.${prod})`;
      }).join('\n')
    : '  (aucune structure construite)';

  // ── Processus ──
  const processes = (ctx.active_processes || []).length
    ? ctx.active_processes.map(p => `  ${p.type}:${p.target} (${p.progress}/${p.max_ticks} ticks, ${p.workers || 0} pers.)`).join('\n')
    : '  aucun';

  // ── Armée ──
  const armyLine = `${ctx.army_soldiers || 0} soldats, équipement: ${ctx.army_equipment || 'aucun'} (puissance: ${ctx.army_power || 0})${ctx.last_combat_tick ? ` — dernier combat : tick ${ctx.last_combat_tick}` : ' — aucun combat enregistré'}`;

  // ── Voisins (knowledge-based) ──
  const neighborsText = ctx.neighbors_info || (
    (ctx.neighbors || []).length
      ? ctx.neighbors.map(n => `▸ ${n.nom} (${n.relation}, force=${n.military_power})`).join('\n  ')
      : 'Aucun. Territoire inexploré dans toutes les directions.'
  );

  // ── Question dynamique ──
  const faits = [];
  if (ctx.food_famine_in != null && ctx.food_famine_in < 10)
    faits.push(`Les réserves alimentaires s'épuisent dans ${ctx.food_famine_in} mois.`);
  const density = (ctx.population || 0) / Math.max(1, ctx.territory_count || 1);
  if (density > 40)
    faits.push(`${ctx.population} habitants sur ${ctx.territory_count} cases.`);
  if (ctx.free_workforce === 0)
    faits.push(`Toute ta population est occupée. Aucune main-d'œuvre disponible. Pour lancer une nouvelle action, des travailleurs doivent être libérés d'une tâche existante (ABANDONNER).`);

  const dynamicQuestion = faits.length > 0
    ? `${faits.join(' ')}\n\nQue décides-tu ?`
    : `Que décides-tu ?`;

  const capLine = ctx.territory_capacity
    ? ` | Capacité du territoire : ${ctx.pop_vs_capacity}${ctx.is_overpopulated ? ' (territoire saturé)' : ''}`
    : '';

  const reliquesPossedeesText = getRelicsPossessedText(ctx);

  return `Tu es le dirigeant de "${ctx.nom}" (${ctx.gouvernement}, âge: ${ctx.age_tech}).
Valeurs fondamentales : ${valeurs}${ctx.description ? ` | ${ctx.description}` : ''}
${formatMemory(ctx.civ_memory, ctx) ? formatMemory(ctx.civ_memory, ctx) + '\n' : ''}${urgentBlock}
Population : ${ctx.population} (${ctx.population_trend}) | Territoire : ${ctx.territory_count} cases${capLine} | Main-d'œuvre libre : ${ctx.free_workforce} pers.

${moralBlock}

RESSOURCES (stock → bilan/tick) :
${resLines}

BIOMES SUR TON TERRITOIRE :
${biomeLines}

STRUCTURES EXISTANTES (NE PAS RECRÉER CE QUI EXISTE) :
${structList}

EN COURS :
${processes}

ARMÉE : ${armyLine}

VOISINS CONNUS :
  ${neighborsText}

CONSÉQUENCES DU DERNIER TICK :
${(ctx.last_consequences || []).map(c =>
  c.type === 'relique_decouverte' ? `  - Vos explorateurs viennent de découvrir une relique : ${c.nom || 'une relique'}. Cette découverte pourrait influencer votre stratégie.` :
  c.type === 'relique_utilisee' ? `  - Votre peuple a utilisé la relique ${c.nom || 'une relique'} pour ${c.data?.effet || 'obtenir un bonus'}. Cela pourrait ouvrir de nouvelles possibilités.` :
  c.type === 'relique_incomprise' ? `  - Vos explorateurs ont ramené quelque chose d'étrange : ${c.nom || 'un objet mystérieux'}. Personne dans votre peuple ne comprend à quoi cela sert. Les artisans l'observent avec curiosité.` :
  c.type === 'animal_decouvert' ? `  - Vos éclaireurs ont repéré un groupe : ${c.nom}. ${c.description || ''}` :
  c.type === 'chasse' && c.succes
    ? `  - Chasse de ${c.nom} réussie : +${c.gains?.nourriture || 0} nourriture, +${c.gains?.peaux || 0} peaux, +${c.gains?.os || 0} os.` :
  c.type === 'chasse' && !c.succes
    ? `  - Chasse de ${c.nom} échouée : ${c.morts || 0} chasseurs tués.` :
  `  - ${c}`
).join('\n') || '  (aucune)'}

---

${reliquesPossedeesText ? reliquesPossedeesText + '\n\n' : ''}${dynamicQuestion}

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
- DIPLOMATIE [action] → [civ cible]
- LOI [description]
- RIEN
SOUHAIT: [un besoin ou désir de ta civilisation en une phrase]`;
}

function parseResponse(text) {
  // Supprimer le markdown bold/italic
  const clean = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();

  const stratMatch = clean.match(/STRAT[ÉE]GIE\s*:\s*(.+)/i);
  const strategie  = stratMatch ? stratMatch[1].trim() : clean.split('\n')[0].trim();

  const effetsStart = clean.indexOf('EFFETS:');
  let effets_text = effetsStart !== -1
    ? clean.slice(effetsStart + 7).trim()
    : clean.split('\n').filter(l => l.trim().startsWith('-')).join('\n');

  const actions = (effets_text.match(/^-\s+([\wÀ-ÿ_]+)/gm) || [])
    .map(m => { const match = m.match(/^-\s+([\wÀ-ÿ_]+)/); return match ? match[1] : 'RIEN'; });

  const souhaitMatch = clean.match(/SOUHAIT\s*:\s*(.+)/i);
  const souhait = souhaitMatch ? souhaitMatch[1].trim() : null;

  return {
    strategie: strategie || 'Nous consolidons notre position.',
    effets_text: effets_text || '- RIEN',
    actions: actions.length ? actions : ['RIEN'],
    raison: strategie || '',
    souhait,
  };
}

async function decide(context) {
  if (!model) {
    const r = mockDecide(context);
    return { ...r, souhait: null };
  }
  try {
    const prompt = buildPrompt(context);
    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    const rawText = result.response.text().trim();
    console.log('[LLM RAW]', rawText.slice(0, 200));
    return parseResponse(rawText);
  } catch (err) {
    console.warn(`Gemini civ → mock (${err.message})`);
    const r = mockDecide(context);
    return { ...r, souhait: null };
  }
}

module.exports = { init, decide };
