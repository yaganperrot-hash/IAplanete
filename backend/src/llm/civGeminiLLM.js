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
};

function buildPrompt(ctx) {
  const valeurs = (ctx.valeurs || []).join(', ') || 'aucune';

  // ── Moral avec frustrations/satisfactions ──
  const moralLabel = ctx.moralLabel || 'neutre';
  const moralLine  = `MORAL : ${ctx.moral || 50}/100 (${moralLabel})`;
  const satisfLines = (ctx.satisfactions || []).map(s => `  ✅ ${s}`).join('\n');
  const frustLines  = (ctx.frustrations  || []).map(f => `  ⚠️ ${f}`).join('\n');
  const moralAlert  = (ctx.moral || 50) < 40 ? '  ⚠️ ALERTE : Risque de révolte si le moral ne remonte pas.' : '';
  const moralBlock  = [moralLine, satisfLines, frustLines, moralAlert].filter(Boolean).join('\n');

  // ── Ressources ──
  const rb = ctx.resourceBilan || {};
  const resLines = Object.entries(rb)
    .filter(([, v]) => v.stock > 0 || v.production > 0)
    .map(([res, v]) => {
      const icon   = RES_EMOJI[res] || '📦';
      const detail = v.production > 0 || v.consumption > 0
        ? ` (prod:+${v.production}, conso:-${v.consumption}, bilan:${v.balance >= 0 ? '+' : ''}${v.balance})`
        : '';
      const warn   = res === 'nourriture' && ctx.food_famine_in != null
        ? ` ⚠️ FAMINE dans ${ctx.food_famine_in} ticks !` : '';
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
    : '  (aucune — construisez des structures pour produire des ressources)';

  // ── Processus ──
  const processes = (ctx.active_processes || []).length
    ? ctx.active_processes.map(p => `  ${p.type}:${p.target} (${p.progress}/${p.max_ticks} ticks, ${p.workers || 0} pers.)`).join('\n')
    : '  aucun';

  // ── Armée ──
  const armyLine = `${ctx.army_soldiers || 0} soldats, équipement: ${ctx.army_equipment || 'aucun'} (puissance: ${ctx.army_power || 0})`;

  // ── Voisins (knowledge-based) ──
  const neighborsText = ctx.neighbors_info || (
    (ctx.neighbors || []).length
      ? ctx.neighbors.map(n => `▸ ${n.nom} (${n.relation}, force=${n.military_power})`).join('\n  ')
      : 'Aucun. Territoire inexploré dans toutes les directions.'
  );

  // ── Question dynamique ──
  const tensions = [...(ctx.frustrations || [])];
  const density  = (ctx.population || 0) / Math.max(1, ctx.territory_count || 1);
  if (density > 40 && !tensions.some(t => t.includes('territoire'))) {
    tensions.push(`${ctx.population} habitants pour seulement ${ctx.territory_count} cases (densité: ${Math.round(density)} hab/case)`);
  }
  if (ctx.food_famine_in != null && ctx.food_famine_in < 10) {
    tensions.push(`Famine dans ${ctx.food_famine_in} ticks si rien ne change`);
  }
  const dynamicQuestion = tensions.length > 0
    ? `SITUATION CRITIQUE :\n${tensions.slice(0, 3).map(t => `⚠️ ${t}`).join('\n')}\n\nEn tant que dirigeant de ${ctx.nom} (${valeurs}), que décides-tu ?`
    : `En tant que dirigeant de ${ctx.nom} (valeurs: ${valeurs}), que souhaites-tu entreprendre ce tour ?`;

  const capLine = ctx.territory_capacity
    ? ` | Capacité du territoire : ${ctx.pop_vs_capacity}${ctx.is_overpopulated ? ' ⚠️ SURPOPULÉ' : ''}`
    : '';

  return `Tu es le dirigeant de "${ctx.nom}" (${ctx.gouvernement}, âge: ${ctx.age_tech}).
Valeurs fondamentales : ${valeurs}${ctx.description ? ` | ${ctx.description}` : ''}
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
${(ctx.last_consequences || []).map(c => `  - ${c}`).join('\n') || '  (aucune)'}

---

${dynamicQuestion}

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
- RIEN`;
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

  return {
    strategie: strategie || 'Nous consolidons notre position.',
    effets_text: effets_text || '- RIEN',
    actions: actions.length ? actions : ['RIEN'],
    raison: strategie || '',
  };
}

async function decide(context) {
  if (!model) return mockDecide(context);
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
    return mockDecide(context);
  }
}

module.exports = { init, decide };
