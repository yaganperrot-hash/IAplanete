const { GoogleGenerativeAI } = require('@google/generative-ai');
const { decide: mockDecide } = require('./mockLLM');

const VALID_ACTIONS = [
  'SE_DEPLACER', 'MANGER', 'BOIRE', 'CHASSER', 'FUIR', 'SE_CACHER',
  'SE_REPRODUIRE', 'DORMIR', 'EXPLORER', 'DEFENDRE_TERRITOIRE', 'ATTAQUER', 'SUIVRE', 'RIEN',
];

let model = null;

function init() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('⚠️  GEMINI_API_KEY absent — décisions rule-based (mock)');
    return false;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { maxOutputTokens: 80, temperature: 0.85 },
  });
  console.log('✓ Gemini 2.0 Flash initialisé');
  return true;
}

function buildPrompt(ctx) {
  const traitsStr = (ctx.traits || []).length > 0 ? (ctx.traits || []).join(', ') : 'aucun';
  const habitatsStr = (ctx.habitats || []).length > 0 ? (ctx.habitats || []).join(', ') : 'indifférent';
  return `Créature: ${ctx.speciesName || '?'} (${ctx.regime}, taille ${ctx.taille}/10, ${ctx.social}, ${ctx.rythme})
Traits: ${traitsStr} | Habitats: ${habitatsStr}
État: énergie ${ctx.energy}%, santé ${ctx.health}%, ${ctx.isNight ? 'nuit' : 'jour'}, biome ${ctx.biome?.biome_type || '?'}
Perception: nourriture=${ctx.nearbyFood}, eau=${ctx.nearbyWater ?? 0}, proies=${ctx.nearbyPrey}, menaces=${ctx.nearbyThreats}, alliés=${ctx.nearbyAllies}, partenaires=${ctx.nearbyMates}, cadavres=${ctx.nearbyCadavres}
Reproduction: ${ctx.canReproduce ? 'prête' : 'cooldown'}${ctx.description ? `\nPersonnalité: ${ctx.description}` : ''}
Actions: ${VALID_ACTIONS.join(', ')}
JSON uniquement: {"action":"ACTION","raison":"max 12 mots français"}`;
}

async function decide(context) {
  if (!model) return mockDecide(context);
  try {
    const result = await model.generateContent(buildPrompt(context));
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return mockDecide(context);
    const parsed = JSON.parse(match[0]);
    if (!VALID_ACTIONS.includes(parsed.action)) return mockDecide(context);
    return { action: parsed.action, raison: parsed.raison || '' };
  } catch (err) {
    console.warn(`Gemini → mock (${err.message})`);
    return mockDecide(context);
  }
}

module.exports = { init, decide };
