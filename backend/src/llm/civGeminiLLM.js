// Civ LLM — Gemini 2.0 Flash (fallback : civMockLLM)
const { decide: mockDecide } = require('./civMockLLM');
const { buildPromptFree } = require('./civPromptFree');
const { parseCivNarrative } = require('./civParserLLM');

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

// Provider for Gemini that matches the signature expected by parseCivNarrative
async function geminiProvider({ model: _, messages, stream, options }) {
  // Combine messages into a single prompt (Gemini 2.0 Flash can handle system/user via roles)
  const combined = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  const request = {
    contents: [{ role: 'user', parts: [{ text: combined }] }],
  };
  if (options) {
    request.generationConfig = {};
    if (options.temperature !== undefined) request.generationConfig.temperature = options.temperature;
    if (options.maxOutputTokens !== undefined) request.generationConfig.maxOutputTokens = options.maxOutputTokens;
    if (options.num_predict !== undefined) request.generationConfig.maxOutputTokens = options.num_predict;
  }
  const result = await model.generateContent(request);
  return {
    message: { content: result.response.text() },
    content: result.response.text(),
  };
}

// Convert parsed action to old format (compatible with actionToEffetLine)
function parsedActionToOld(action) {
  const verbMap = {
    affecter: 'AFFECTER',
    construire: 'CONSTRUIRE',
    explorer: 'EXPLORER',
    coloniser: 'COLONISER',
    attaquer: 'ATTAQUER',
    diplomatie: 'DIPLOMATIE',
    envoyer_emissaire: 'ENVOYER_EMISSAIRE',
    envoyer_marchands: 'ENVOYER_MARCHANDS',
    espionner: 'ESPIONNER',
    loi: 'LOI',
    recruter: 'RECRUTER',
    abandonner: 'ABANDONNER',
    chasser: 'CHASSER',
    utiliser_relique: 'UTILISER_RELIQUE',
    etudier_relique: 'ETUDIER_RELIQUE',
  };
  // Si le type est dans verbMap, on garde le comportement actuel
  if (verbMap[action.type]) {
    const verbe = verbMap[action.type];
    let parametres = '';
    if (action.quantite) parametres += action.quantite + ' ';
    if (action.cible) parametres += action.cible + ' ';
    if (action.direction) parametres += 'direction:' + action.direction;
    parametres = parametres.trim();
    return {
      type: verbe,
      raw: action.description_brute || '',
      parametres,
      cible: action.cible,
      quantite: action.quantite,
      direction: action.direction,
    };
  } else {
    // Type inconnu → transformer
    if (action.ressource_entree && action.ressource_sortie) {
      return { type: 'TRANSFORMER', typeOriginal: action.type,
               input: action.ressource_entree, output: action.ressource_sortie,
               quantite: action.quantite || 1, personnes: action.nb_personnes || 5,
               raw: action.description_brute || '' };
    }
    return { type: 'RIEN', typeOriginal: action.type, raw: action.description_brute || '' };
  }
}

// Convert old‑format action to effet line (compatible with existing resolver)
function actionToEffetLine(action) {
  const p = action.parametres || '';

  switch (action.type) {
    case 'AFFECTER': {
      const nb    = action.nombre || 10;
      const tache = action.tache  || p || 'tâche générale';
      return `AFFECTER ${nb} personnes → ${tache}`;
    }
    case 'CONSTRUIRE': {
      let nom = action.nomStructure || p.split(/\s+/)[0] || 'construction';
      if (!nom || /^\d+$/.test(nom)) {
        nom = action.cible || 'Construction';
      }
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
    case 'ATTAQUER': {
      const cible = action.cible || p.trim();
      return `ATTAQUER ${cible}`;
    }
    case 'RECRUTER': {
      const nb = action.quantite || parseInt(action.parametres) || 10;
      return `AFFECTER ${nb} personnes → armée`;
    }

    case 'UTILISER_RELIQUE': {
      const cible = action.cible || action.parametres || '';
      return `UTILISER_RELIQUE ${cible}`;
    }

    case 'ETUDIER_RELIQUE': {
      const cible = action.cible || action.parametres || '';
      return `ETUDIER_RELIQUE ${cible}`;
    }

    case 'TRANSFORMER': {
      const input = action.input || '?';
      const output = action.output || '?';
      const quantite = action.quantite || 1;
      const personnes = action.personnes || 5;
      const typeOriginal = action.typeOriginal || 'transformer';
      return `TRANSFORMER ${typeOriginal} (input:${input}, output:${output}, quantite:${quantite}, personnes:${personnes})`;
    }

    case 'REORGANISER':
    case 'RIEN':
    default:
      return 'RIEN';
  }
}

async function decide(context) {
  if (!model) {
    const r = mockDecide(context);
    return { ...r, nouveauCap: null, analyseInterne: r.strategie };
  }

  try {
    const prompt = buildPromptFree(context);
    const response = await Promise.race([
      model.generateContent(prompt),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
    ]);
    const narrative = response.response.text().trim();
    console.log('[GEMINI CIV NARRATIVE]', narrative.slice(0, 300));

    const { actions: parsedActions, etat_psychologique, memoire_a_conserver } = await parseCivNarrative(
      narrative,
      geminiProvider,
      { model: null, stream: false, options: { temperature: 0.3, maxOutputTokens: 800 } }
    );

    // Dériver souhait
    const souhait = memoire_a_conserver || etat_psychologique || null;

    // Convertir les actions parsées en format ancien pour effet_text
    const oldActions = parsedActions.map(parsedActionToOld);
    const effets_text = oldActions.map(a => actionToEffetLine(a)).join('\n') || 'RIEN';
    const actions = parsedActions.map(a => a.type);

    console.log('[LLM] Actions parsées:', actions.join(', ') || 'RIEN');

    return {
      strategie: narrative,
      effets_text,
      actions: actions.length ? actions : ['RIEN'],
      raison: etat_psychologique,
      nouveauCap: null,
      souhait,
      analyseInterne: narrative,
    };
  } catch (err) {
    console.warn(`Gemini civ → mock (${err.message})`);
    const r = mockDecide(context);
    return { ...r, nouveauCap: null, souhait: null, analyseInterne: r.strategie };
  }
}

module.exports = { init, decide };
