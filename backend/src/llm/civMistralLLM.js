// Civ LLM — Mistral AI mistral-small-latest (fallback : civMockLLM)
const { decide: mockDecide } = require('./civMockLLM');

const MS_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL  = 'mistral-small-latest';

let apiKey = null;

function init() {
  apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('⚠️  MISTRAL_API_KEY absent — décisions civ rule-based (mock)');
    return false;
  }
  console.log(`✓ Mistral AI (Civilisations) initialisé (${MODEL})`);
  return true;
}

const EMOJI = {
  agriculture:'🌾', militaire:'⚔️', commerce:'🏪', religieux:'🛕',
  extraction:'⛏️', production:'🔨', defense:'🏰', maritime:'⚓',
  savoir:'📚', bois:'🪓', chasse:'🏹', peche:'🎣', surveillance:'👁️', autre:'🏠',
  mine_cuivre:'🟤', mine_fer:'⚙️', mine_or:'🟡', mine_charbon:'🖤',
};

const RES_EMOJI = {
  nourriture:'🍞', bois:'🪵', pierre:'🪨', glaise:'🧱',
  silex:'🔩', sable:'⏳', sel:'🧂', cuivre:'🟤',
  etain:'⬜', fer:'⚙️', or:'🟡', charbon:'🖤',
};

function buildPrompt(ctx) {
  const valeurs   = (ctx.valeurs || []).join(', ') || 'aucune';
  const neighbors = (ctx.neighbors || []).length
    ? ctx.neighbors.map(n => `${n.nom}(${n.relation},force=${n.military_power})`).join(', ')
    : 'aucun connu — territoire inexploré autour';

  // Ressources avec bilan/tick
  const rb = ctx.resourceBilan || {};
  const resLines = Object.entries(rb)
    .filter(([, v]) => v.stock > 0 || v.production > 0)
    .map(([res, v]) => {
      const icon    = RES_EMOJI[res] || '📦';
      const bilanS  = v.balance >= 0 ? `+${v.balance}` : `${v.balance}`;
      const detail  = v.production > 0 || v.consumption > 0
        ? ` (prod:+${v.production}, conso:-${v.consumption}, bilan:${bilanS}/tick)` : '';
      let warn = '';
      if (res === 'nourriture' && ctx.food_famine_in != null)
        warn = ` ⚠️ FAMINE dans ${ctx.food_famine_in} ticks !`;
      return `  ${icon} ${res.charAt(0).toUpperCase() + res.slice(1)} : ${v.stock}${detail}${warn}`;
    })
    .join('\n') || '  (aucune ressource — affectez des travailleurs à des structures de production)';

  // Biomes du territoire
  const biomeLines = (ctx.territory_biomes || []).slice(0, 5)
    .map(b => `  - ${b.biome} (${b.count} cases) : ${b.produces}`)
    .join('\n') || '  (aucun)';

  // Gisements connus hors territoire
  const depMap = {};
  for (const d of (ctx.known_deposits || [])) {
    const k = d.mineral;
    if (!depMap[k]) depMap[k] = [];
    depMap[k].push(d.biome);
  }
  const depositLines = Object.entries(depMap)
    .map(([min, biomes]) => `  - ${min} : ${[...new Set(biomes)].join(', ')}`)
    .join('\n') || '  (aucun découvert)';

  // Structures existantes avec production
  const structList = (ctx.structures || []).length
    ? ctx.structures.map(s => {
        const prod = s.prod_per_tick > 0 ? ` → +${s.prod_per_tick} ${s.production}/tick` : '';
        return `  ${EMOJI[s.category]||'🏠'} ${s.name} (${s.workers} pers.${prod})`;
      }).join('\n')
    : '  (aucune — construisez des structures pour produire des ressources)';

  const processes = (ctx.active_processes || []).length
    ? ctx.active_processes.map(p => `${p.type}:${p.target}(${p.progress}/${p.max_ticks}ticks)`).join(', ')
    : 'aucun';

  const armyLine = `${ctx.army_soldiers || 0} soldats, équipement: ${ctx.army_equipment || 'aucun'} (puissance: ${ctx.army_power || 0})`;

  return `Tu es le chef de "${ctx.nom}" (${ctx.gouvernement}, âge: ${ctx.age_tech}).
Valeurs: ${valeurs}${ctx.description ? ` | Personnalité: ${ctx.description}` : ''}
Population: ${ctx.population} (${ctx.population_trend}) | Moral: ${ctx.moral}% | Territoire: ${ctx.territory_count} cases
ARMÉE : ${armyLine}
Main-d'œuvre libre: ${ctx.free_workforce} personnes

RESSOURCES (stock → bilan/tick) :
${resLines}

BIOMES SUR TON TERRITOIRE :
${biomeLines}

GISEMENTS CONNUS (hors territoire) :
${depositLines}

STRUCTURES EXISTANTES (NE PAS RECRÉER CE QUI EXISTE DÉJÀ) :
${structList}

Chantiers en cours: ${processes}
Voisins connus: ${neighbors}

Décide UNE seule action. Réponds EXACTEMENT :
STRATÉGIE: [décision en une phrase française]
EFFETS:
- [CRÉER/AFFECTER/MODIFIER/ENVOYER/DIPLOMATIE/LOI/RIEN] [description] (ressources: X bois/pierre, personnes: Y, durée: Z ticks)

Exemples valides :
- CRÉER champs cultivés (ressources: 10 bois, personnes: 10, durée: 5 ticks)
- AFFECTER 15 personnes → culture des champs (ressources: aucune, durée: permanent)
- AFFECTER 20 personnes → armée (ressources: aucune, durée: permanent)
- ENVOYER 5 personnes → exploration nord (durée: 3 ticks)
- DIPLOMATIE proposer_alliance → [nom_voisin]
- LOI réduction des impôts
- RIEN`;
}

function parseResponse(text) {
  const stratMatch = text.match(/STRATÉGIE\s*:\s*(.+)/i);
  const strategie  = stratMatch ? stratMatch[1].trim() : text.split('\n')[0].trim();

  const effetsStart = text.indexOf('EFFETS:');
  let effets_text = effetsStart !== -1
    ? text.slice(effetsStart + 7).trim()
    : text.split('\n').filter(l => l.trim().startsWith('-')).join('\n');

  const actions = (effets_text.match(/^-\s+([\wÀ-ÿ]+)/gm) || [])
    .map(m => { const match = m.match(/^-\s+([\wÀ-ÿ]+)/); return match ? match[1] : 'RIEN'; });

  return {
    strategie: strategie || 'Nous consolidons notre position.',
    effets_text: effets_text || '- RIEN',
    actions: actions.length ? actions : ['RIEN'],
    raison: strategie || '',
  };
}

async function decide(context) {
  if (!apiKey) return mockDecide(context);
  try {
    const res = await fetch(MS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: buildPrompt(context) }],
        max_tokens: 200,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`Mistral civ ${res.status} → mock`);
      return mockDecide(context);
    }

    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content?.trim() || '';
    console.log('[LLM RAW]', rawText);
    // Strip markdown bold/italic que Mistral ajoute parfois (**MOT** → MOT)
    const text = rawText.replace(/\*\*/g, '').replace(/\*/g, '');
    return parseResponse(text);
  } catch (err) {
    console.warn(`Mistral civ → mock (${err.message})`);
    return mockDecide(context);
  }
}

module.exports = { init, decide };
