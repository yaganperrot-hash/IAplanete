// Mistral AI — mistral-small-latest (compatible OpenAI, fallback : mockLLM)
const { decide: mockDecide } = require('./mockLLM');

const VALID_ACTIONS = [
  'SE_DEPLACER', 'MANGER', 'BOIRE', 'CHASSER', 'FUIR', 'SE_CACHER',
  'SE_REPRODUIRE', 'DORMIR', 'EXPLORER', 'DEFENDRE_TERRITOIRE', 'ATTAQUER', 'SUIVRE', 'RIEN',
  'CHERCHER_PARTENAIRE', 'PROTEGER_PETITS',
];

const MS_URL = 'https://api.mistral.ai/v1/chat/completions';
const MODEL  = 'mistral-small-latest';

let apiKey = null;

function init() {
  apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    console.log('⚠️  MISTRAL_API_KEY absent — décisions rule-based (mock)');
    return false;
  }
  console.log(`✓ Mistral AI initialisé (${MODEL})`);
  return true;
}

function buildPrompt(ctx) {
  const traitsStr   = (ctx.traits   || []).length > 0 ? ctx.traits.join(', ')   : 'aucun';
  const habitatsStr = (ctx.habitats || []).length > 0 ? ctx.habitats.join(', ') : 'indifférent';

  const securite = ctx.nearbyThreats > 0
    ? (ctx.health < 25 ? 'DANGER_IMMÉDIAT' : 'menace_détectée') : 'sûr';
  const faim  = ctx.energy < 20 ? 'CRITIQUE' : ctx.energy < 40 ? 'haute' : ctx.energy < 70 ? 'moyenne' : 'basse';
  const sante = ctx.health  < 30 ? 'BLESSÉ'  : ctx.health  < 60 ? 'moyenne' : 'bonne';

  const rouge  = ctx.nearbyThreats > 0 ? 'FUIR, SE_CACHER' + (ctx.health < 25 ? '' : ', ATTAQUER') : '—';
  const orange = [];
  if (ctx.nearbyFood > 0 && ctx.regime !== 'carnivore' && ctx.energy < 80) orange.push('MANGER');
  if (ctx.nearbyWater > 0 && (ctx.health < 60 || ctx.energy < 50)) orange.push('BOIRE');
  if (ctx.nearbyPrey > 0 && ['carnivore', 'omnivore', 'insectivore', 'charognard'].includes(ctx.regime)) orange.push('CHASSER');

  const jaune = ['SE_DEPLACER', 'EXPLORER'];
  if (ctx.energy < 50) jaune.unshift('DORMIR');
  jaune.push('DEFENDRE_TERRITOIRE');

  const vert = [];
  if (ctx.nearbyPetits > 0 && ctx.nearbyThreats > 0) vert.push('PROTEGER_PETITS');
  if (ctx.canReproduce && ctx.adjacentReadyMates > 0 && ctx.energy > 60) vert.push('SE_REPRODUIRE');
  if (ctx.canReproduce && ctx.repro_drive >= 60 && ctx.energy > 55) vert.push('CHERCHER_PARTENAIRE');

  return `Créature: ${ctx.speciesName || '?'} (${ctx.regime}, taille ${ctx.taille}/10, ${ctx.social}, ${ctx.rythme})
Traits: ${traitsStr} | Habitats: ${habitatsStr}

SITUATION :
- Sécurité: ${securite}
- Faim: ${faim} (énergie ${ctx.energy}%)
- Santé: ${sante} (${ctx.health}%)
- Biome: ${ctx.biome?.biome_type || '?'} | ${ctx.isNight ? 'nuit' : 'jour'}
- Perception: nourriture=${ctx.nearbyFood}, eau=${ctx.nearbyWater ?? 0}, proies=${ctx.nearbyPrey}, menaces=${ctx.nearbyThreats}, alliés=${ctx.nearbyAllies}, cadavres=${ctx.nearbyCadavres}
- Reproduction: ${ctx.reproStatus || 'immature'}${ctx.nearbyPetits > 0 ? ` | ${ctx.nearbyPetits} petits proches` : ''}${ctx.description ? `\nPersonnalité: ${ctx.description}` : ''}

ACTIONS PAR PRIORITÉ :
🔴 SURVIE (menace): ${rouge}
🟠 BESOINS VITAUX: ${orange.length ? orange.join(', ') : '—'}
🟡 ENTRETIEN: ${jaune.join(', ')}
🟢 REPRODUCTION: ${vert.length ? vert.join(', ') : '—'}
⚪ AUTRE: SUIVRE, RIEN

Choisis UNE action. Priorise la survie.
Réponds UNIQUEMENT :
ACTION: [ton action]
RAISON: [1 phrase max 12 mots]`;
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
        max_tokens: 80,
        temperature: 0.85,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`Mistral ${res.status} → mock`);
      if (res.status === 429) console.warn('Mistral quota dépassé — mock activé');
      return mockDecide(context);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const actionMatch = text.match(/ACTION\s*:\s*([A-Z_]+)/i);
    if (!actionMatch || !VALID_ACTIONS.includes(actionMatch[1].toUpperCase())) return mockDecide(context);
    const raisonMatch = text.match(/RAISON\s*:\s*(.+)/i);
    return { action: actionMatch[1].toUpperCase(), raison: (raisonMatch?.[1] || '').trim().slice(0, 100) };
  } catch (err) {
    console.warn(`Mistral → mock (${err.message})`);
    return mockDecide(context);
  }
}

module.exports = { init, decide };
