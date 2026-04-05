'use strict';
/**
 * nightMonitor.js — Surveillance nocturne des 10 civilisations
 * Lance: node backend/scripts/nightMonitor.js
 * - Snapshot horaire → docs/night_logs/snapshot_HH.json
 * - À 6h00 → génère le rapport PDF automatiquement
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DB_PATH = path.join(__dirname, '../data/aiplanet.db');
const LOGS_DIR = path.join(__dirname, '../../docs/night_logs');
const REPORT_DIR = path.join(__dirname, '../../docs');

if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ─── Collecte snapshot ────────────────────────────────────────────────────────

function collectSnapshot(prevTickRange) {
  const db = new DatabaseSync(DB_PATH);
  const now = new Date();

  const world = db.prepare("SELECT id, tick FROM worlds WHERE world_type='civilisations' ORDER BY id DESC LIMIT 1").get();
  const tick = world?.tick ?? 0;
  const worldId = world?.id ?? 1;

  const civs = db.prepare(`
    SELECT id, nom, prompt_variant, population, moral, frustration_ticks,
           territory_count, army_soldiers, military_power, resources, status,
           active_trade_routes, knowledge_about, gouvernement, valeurs
    FROM civilizations ORDER BY id
  `).all();

  let structures = [];
  const structuresByCiv = {};
  try {
    structures = db.prepare(`
      SELECT civ_id, name, role, workers, COUNT(*) as count
      FROM structures
      WHERE world_id = ${worldId}
      GROUP BY civ_id, role
      ORDER BY civ_id, count DESC
    `).all();

    // Regrouper par civ_id
    structures.forEach(s => {
      if (!structuresByCiv[s.civ_id]) structuresByCiv[s.civ_id] = [];
      structuresByCiv[s.civ_id].push({ role: s.role, name: s.name, count: s.count, workers: s.workers });
    });
  } catch (e) {
    // table absente — ignoré
  }

  const civData = civs.map(c => {
    const res = safeJSON(c.resources, {});
    const frut = safeJSON(c.frustration_ticks, {});
    const totalFrust = Object.values(frut).reduce((a, b) => a + Number(b), 0);
    const knowledge = safeJSON(c.knowledge_about, {});
    return {
      id: c.id,
      nom: c.nom,
      variant: c.prompt_variant,
      pop: c.population,
      moral: c.moral,
      frustration: totalFrust,
      territory: c.territory_count,
      army: c.army_soldiers,
      military_power: c.military_power,
      food: res.nourriture ?? 0,
      bois: res.bois ?? 0,
      pierre: res.pierre ?? 0,
      trade_routes: c.active_trade_routes ?? 0,
      known_civs: Object.keys(knowledge).length,
      status: c.status,
      gouvernement: c.gouvernement ?? '?',
      valeurs: safeJSON(c.valeurs, []),
      structures: structuresByCiv[c.id] || [],
    };
  });

  // Events depuis le dernier snapshot
  const minTick = prevTickRange ?? (tick - 80);
  const events = db.prepare(`
    SELECT tick, type, description FROM events
    WHERE tick > ? AND world_id = ${worldId}
    ORDER BY tick ASC
  `).all(minTick);

  // Compter par type
  const eventCounts = {};
  events.forEach(e => { eventCounts[e.type] = (eventCounts[e.type] ?? 0) + 1; });

  // Reliques découvertes depuis dernier check
  const relics = db.prepare(`
    SELECT r.name, r.type, r.domain, r.discovered_at_tick, r.taken, r.used, r.bonus_remaining,
           c.nom as owner_nom, c.prompt_variant as owner_variant
    FROM relics r
    LEFT JOIN civilizations c ON c.id = r.discovered_by
    WHERE r.discovered_by IS NOT NULL AND r.discovered_at_tick > ?
    ORDER BY r.discovered_at_tick ASC
  `).all(minTick);

  // Diplomatie
  const diplo = db.prepare(`SELECT civ_a_id, civ_b_id, relation FROM diplomacy WHERE world_id=${worldId}`).all();

  // Guerres récentes (events type 'guerre' ou 'combat')
  const wars = events.filter(e => ['guerre', 'combat', 'attaque'].includes(e.type));

  // Commerce réel (events type 'commerce' ou 'echange')
  const trades = events.filter(e => ['commerce', 'echange', 'trade'].includes(e.type));

  db.close();

  return {
    timestamp: now.toISOString(),
    heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    tick,
    civs: civData,
    eventCounts,
    eventsRaw: events.slice(-50), // 50 derniers max
    relicsDiscovered: relics,
    diplomacy: diplo,
    wars,
    trades,
    tickRangeChecked: [minTick, tick],
  };
}

function safeJSON(v, fb) {
  try { return JSON.parse(v ?? JSON.stringify(fb)); } catch { return fb; }
}

// ─── Boucle principale ────────────────────────────────────────────────────────

let lastTick = null;
const snapshots = [];

async function doHourlyCheck() {
  const label = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  console.log(`\n[${label}] 📊 Snapshot en cours...`);

  try {
    const snap = collectSnapshot(lastTick);
    lastTick = snap.tick;
    snapshots.push(snap);

    // Sauvegarde JSON
    const fname = `snapshot_${label.replace(':', 'h')}.json`;
    fs.writeFileSync(path.join(LOGS_DIR, fname), JSON.stringify(snap, null, 2));

    // Résumé console
    console.log(`  Tick: ${snap.tick} | Events nouveaux: ${snap.eventsRaw.length} | Reliques découvertes: ${snap.relicsDiscovered.length}`);
    snap.civs.forEach(c => {
      const flag = c.moral < 20 ? '🔴' : c.moral < 50 ? '🟡' : '🟢';
      console.log(`  ${flag} [${c.variant}] ${c.nom}: pop=${c.pop} moral=${c.moral} frust=${c.frustration} terr=${c.territory}`);
    });
    if (snap.wars.length) console.log(`  ⚔️  Guerres/combats: ${snap.wars.length}`);
    if (snap.trades.length) console.log(`  💰 Échanges commerciaux: ${snap.trades.length}`);
  } catch (err) {
    console.error(`[${label}] ERREUR snapshot:`, err.message);
  }
}

async function generateFinalReport() {
  console.log('\n🌅 6h00 — Génération du rapport final...');

  // Charger tous les snapshots sauvegardés (au cas où le process aurait redémarré)
  const allSnaps = [];
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
  files.forEach(f => {
    try {
      allSnaps.push(JSON.parse(fs.readFileSync(path.join(LOGS_DIR, f), 'utf8')));
    } catch {}
  });
  if (allSnaps.length === 0 && snapshots.length > 0) allSnaps.push(...snapshots);
  // Trier par tick croissant (évite le bug alphabétique 22h > 00h)
  allSnaps.sort((a, b) => (a.tick ?? 0) - (b.tick ?? 0));

  const reportPath = path.join(REPORT_DIR, 'rapport_nuit.html');
  const html = buildHTMLReport(allSnaps);
  fs.writeFileSync(reportPath, html);
  console.log(`  HTML écrit: ${reportPath}`);

  // PDF via puppeteer
  try {
    const pdfPath = path.join(REPORT_DIR, 'rapport_nuit.pdf');
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file:///${reportPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
    await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    await browser.close();
    console.log(`  ✅ PDF généré: ${pdfPath}`);
  } catch (err) {
    console.error('  ⚠️  PDF échoué (puppeteer):', err.message);
    console.log('  → Le rapport HTML est disponible: docs/rapport_nuit.html');
  }
}

// ─── Rapport HTML ─────────────────────────────────────────────────────────────

function buildHTMLReport(snaps) {
  if (snaps.length === 0) return '<html><body><h1>Aucune donnée</h1></body></html>';

  const first = snaps[0];
  const last = snaps[snaps.length - 1];

  // Variants map
  const variantNames = {
    V0: 'V0 — Baseline',
    V1: 'V1 — Survie/Frustration',
    V2: 'V2 — Narratif immersif',
    V3: 'V3 — Liberté maximale',
    V4: 'V4 — Question ouverte',
    V5: 'V5 — Contexte géopolitique',
    V6: 'V6 — Conséquences explicites',
    V7: 'V7 — Mémoire longue',
    V8: 'V8 — Isolationniste',
    V9: 'V9 — Mystique/spirituel',
  };

  // Agréger les événements sur toute la nuit
  const allEvents = snaps.flatMap(s => s.eventsRaw || []);
  const allRelics = snaps.flatMap(s => s.relicsDiscovered || []);
  const allWars = snaps.flatMap(s => s.wars || []);
  const allTrades = snaps.flatMap(s => s.trades || []);

  // Dédupliquer les reliques par nom+tick
  const relicsMap = {};
  allRelics.forEach(r => { relicsMap[`${r.name}_${r.discovered_at_tick}`] = r; });
  const uniqueRelics = Object.values(relicsMap);

  // Stats par variant
  const variantStats = {};
  first.civs.forEach(c => {
    variantStats[c.variant] = {
      nom: c.nom,
      variant: c.variant,
      popStart: c.pop,
      moralStart: c.moral,
      territoryStart: c.territory,
    };
  });
  last.civs.forEach(c => {
    if (variantStats[c.variant]) {
      variantStats[c.variant].popEnd = c.pop;
      variantStats[c.variant].moralEnd = c.moral;
      variantStats[c.variant].territoryEnd = c.territory;
      variantStats[c.variant].popGrowth = c.pop - variantStats[c.variant].popStart;
      variantStats[c.variant].territoryGrowth = c.territory - variantStats[c.variant].territoryStart;
      variantStats[c.variant].moralDelta = c.moral - variantStats[c.variant].moralStart;
      variantStats[c.variant].armyFinal = c.army;
      variantStats[c.variant].tradeFinal = c.trade_routes;
      variantStats[c.variant].knownCivsFinal = c.known_civs;
      variantStats[c.variant].statusFinal = c.status;
    }
  });

  // Compter events par type et par variant (approximation : on match civ nom dans description)
  Object.keys(variantStats).forEach(v => {
    const civNom = variantStats[v].nom;
    const civEvents = allEvents.filter(e => e.description && e.description.includes(civNom));
    variantStats[v].eventsTotal = civEvents.length;
    variantStats[v].revoltes = civEvents.filter(e => e.type === 'revolte').length;
    variantStats[v].explorations = civEvents.filter(e => e.type === 'exploration').length;
    variantStats[v].constructions = civEvents.filter(e => e.type === 'construction').length;
    variantStats[v].echecs = civEvents.filter(e => e.type === 'echec').length;
    variantStats[v].diplomatie = civEvents.filter(e => e.type === 'diplomatie' || e.type === 'mission').length;
    variantStats[v].catastrophes = civEvents.filter(e => e.type === 'catastrophe').length;
    variantStats[v].reliquesDecouvertes = uniqueRelics.filter(r => r.owner_nom && r.owner_nom.includes(civNom)).length;
    variantStats[v].warEvents = allWars.filter(e => e.description && e.description.includes(civNom)).length;
  });

  // Score d'activité = actions variées non nulles
  Object.keys(variantStats).forEach(v => {
    const s = variantStats[v];
    s.activityScore = (s.explorations > 0 ? 1 : 0) + (s.constructions > 0 ? 1 : 0)
      + (s.diplomatie > 0 ? 1 : 0) + (s.warEvents > 0 ? 1 : 0) + (s.reliquesDecouvertes > 0 ? 1 : 0)
      + (s.popGrowth > 0 ? 1 : 0) + (s.territoryGrowth > 0 ? 1 : 0);
  });

  const sortedVariants = Object.values(variantStats).sort((a, b) => b.activityScore - a.activityScore);

  // Évolution pop par heure
  const popEvolution = snaps.map(s => ({
    heure: s.heure,
    tick: s.tick,
    civs: s.civs.map(c => ({ variant: c.variant, pop: c.pop, moral: c.moral })),
  }));

  // Ligne pop chart data
  const variants = first.civs.map(c => c.variant);
  const chartData = variants.map(v => ({
    label: v,
    data: popEvolution.map(h => h.civs.find(c => c.variant === v)?.pop ?? null),
  }));

  const css = `
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: #0f1117; color: #e2e8f0; }
    .page { max-width: 1100px; margin: 0 auto; padding: 30px 20px; }
    h1 { color: #f7c948; font-size: 2em; border-bottom: 2px solid #f7c948; padding-bottom: 10px; }
    h2 { color: #63b3ed; font-size: 1.3em; margin-top: 30px; }
    h3 { color: #9ae6b4; font-size: 1.1em; }
    .meta { color: #718096; font-size: 0.9em; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.85em; }
    th { background: #1a2035; color: #f7c948; padding: 8px 10px; text-align: left; }
    td { padding: 7px 10px; border-bottom: 1px solid #2d3748; }
    tr:hover td { background: #1a202c; }
    .good { color: #68d391; font-weight: bold; }
    .bad { color: #fc8181; font-weight: bold; }
    .neutral { color: #e2e8f0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.78em; font-weight: bold; margin: 0 2px; }
    .badge-blue { background: #2b6cb0; color: white; }
    .badge-green { background: #276749; color: white; }
    .badge-red { background: #c53030; color: white; }
    .badge-yellow { background: #744210; color: #f6e05e; }
    .summary-box { background: #1a202c; border: 1px solid #2d3748; border-radius: 8px; padding: 15px 20px; margin: 15px 0; }
    .lecon { background: #1a2035; border-left: 4px solid #f7c948; padding: 12px 16px; margin: 10px 0; border-radius: 0 8px 8px 0; }
    .lecon strong { color: #f7c948; }
    .rank1 td:first-child { color: #f7c948; font-weight: bold; }
    .rank1 { background: #1a2010; }
    .dead { opacity: 0.5; text-decoration: line-through; }
    .civ-fiche { background: #1a202c; border: 1px solid #2d3748; border-radius: 8px; padding: 15px 20px; margin: 12px 0; }
    .fiche-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
    .fiche-stats { font-size: 0.85em; color: #a0aec0; line-height: 1.8; }
    .fiche-events ul { margin: 4px 0; padding-left: 20px; font-size: 0.83em; color: #cbd5e0; }
  `;

  const tickRange = `tick ${first.tick} → ${last.tick}`;
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Tableau comparatif variants
  let variantTable = `
    <table>
      <tr>
        <th>Variant</th><th>Civilisation</th>
        <th>Pop début → fin</th><th>Δ Pop</th>
        <th>Moral fin</th><th>Territoire Δ</th>
        <th>Explor.</th><th>Constru.</th><th>Diplo.</th>
        <th>Révoltes</th><th>Catastrophes</th><th>Reliques</th>
        <th>Armée</th><th>Score</th>
      </tr>`;
  sortedVariants.forEach((s, i) => {
    const dead = s.statusFinal === 'dead' ? ' class="dead"' : (i === 0 ? ' class="rank1"' : '');
    const popCls = s.popGrowth > 0 ? 'good' : s.popGrowth < 0 ? 'bad' : 'neutral';
    const moralCls = s.moralEnd >= 60 ? 'good' : s.moralEnd < 30 ? 'bad' : 'neutral';
    variantTable += `<tr${dead}>
      <td><span class="badge badge-blue">${s.variant}</span></td>
      <td>${s.nom}</td>
      <td>${s.popStart} → ${s.popEnd ?? '?'}</td>
      <td class="${popCls}">${s.popGrowth >= 0 ? '+' : ''}${s.popGrowth ?? '?'}</td>
      <td class="${moralCls}">${s.moralEnd ?? '?'}</td>
      <td>${s.territoryGrowth >= 0 ? '+' : ''}${s.territoryGrowth ?? '?'}</td>
      <td>${s.explorations}</td>
      <td>${s.constructions}</td>
      <td>${s.diplomatie}</td>
      <td>${s.revoltes > 0 ? `<span class="bad">${s.revoltes}</span>` : '0'}</td>
      <td>${s.catastrophes > 0 ? `<span class="badge-yellow badge">${s.catastrophes}</span>` : '0'}</td>
      <td>${s.reliquesDecouvertes > 0 ? `<span class="good">${s.reliquesDecouvertes}</span>` : '0'}</td>
      <td>${s.armyFinal > 0 ? `⚔️ ${s.armyFinal}` : '—'}</td>
      <td><strong>${s.activityScore}/7</strong></td>
    </tr>`;
  });
  variantTable += '</table>';

  // Timeline pop par snapshot
  let popTable = `<table><tr><th>Heure</th><th>Tick</th>`;
  popEvolution[0]?.civs.forEach(c => { popTable += `<th>${c.variant}</th>`; });
  popTable += '</tr>';
  popEvolution.forEach(h => {
    popTable += `<tr><td>${h.heure}</td><td>${h.tick}</td>`;
    h.civs.forEach(c => {
      const cls = c.moral < 20 ? 'bad' : c.moral < 50 ? 'neutral' : 'good';
      popTable += `<td class="${cls}">${c.pop}</td>`;
    });
    popTable += '</tr>';
  });
  popTable += '</table>';

  // Timeline moral par snapshot
  let moralTable = `<table><tr><th>Heure</th><th>Tick</th>`;
  popEvolution[0]?.civs.forEach(c => { moralTable += `<th>${c.variant}</th>`; });
  moralTable += '</tr>';
  popEvolution.forEach(h => {
    moralTable += `<tr><td>${h.heure}</td><td>${h.tick}</td>`;
    h.civs.forEach(c => {
      const cls = (c.moral ?? 100) < 30 ? 'bad' : (c.moral ?? 100) < 60 ? 'neutral' : 'good';
      moralTable += `<td class="${cls}">${c.moral ?? '—'}</td>`;
    });
    moralTable += '</tr>';
  });
  moralTable += '</table>';

  // Reliques
  let relicSection = '';
  if (uniqueRelics.length > 0) {
    relicSection = `<h2>🏺 Reliques découvertes</h2><table>
      <tr><th>Nom</th><th>Type</th><th>Tick</th><th>Découverte par</th><th>Variant</th><th>Prise</th><th>Utilisée</th></tr>`;
    uniqueRelics.forEach(r => {
      relicSection += `<tr>
        <td>${r.name}</td><td>${r.type}</td><td>${r.discovered_at_tick}</td>
        <td>${r.owner_nom ?? '?'}</td><td><span class="badge badge-blue">${r.owner_variant ?? '?'}</span></td>
        <td>${r.taken ? '<span class="good">✓</span>' : '✗'}</td>
        <td>${r.used ? '<span class="good">✓</span>' : '✗'}</td>
      </tr>`;
    });
    relicSection += '</table>';
  } else {
    relicSection = `<h2>🏺 Reliques</h2><p class="meta">Aucune relique découverte cette nuit.</p>`;
  }

  // Diplomatie finale
  const lastDiplo = last.diplomacy || [];
  let diploSection = `<h2>🤝 Diplomatie (état final)</h2>`;
  if (lastDiplo.length === 0) {
    diploSection += `<p class="meta">Aucune relation enregistrée.</p>`;
  } else {
    diploSection += `<table><tr><th>Civ A</th><th>Civ B</th><th>Relation</th></tr>`;
    lastDiplo.forEach(d => {
      const civA = last.civs.find(c => c.id === d.civ_a_id);
      const civB = last.civs.find(c => c.id === d.civ_b_id);
      const cls = d.relation === 'alliance' ? 'good' : d.relation === 'guerre' ? 'bad' : 'neutral';
      diploSection += `<tr><td>${civA?.nom ?? d.civ_a_id} (${civA?.variant ?? '?'})</td>
        <td>${civB?.nom ?? d.civ_b_id} (${civB?.variant ?? '?'})</td>
        <td class="${cls}">${d.relation}</td></tr>`;
    });
    diploSection += '</table>';
  }

  // Guerres
  let warSection = '';
  if (allWars.length > 0) {
    warSection = `<h2>⚔️ Combats / Guerres</h2><table>
      <tr><th>Tick</th><th>Type</th><th>Description</th></tr>`;
    allWars.forEach(w => {
      warSection += `<tr><td>${w.tick}</td><td>${w.type}</td><td>${w.description}</td></tr>`;
    });
    warSection += '</table>';
  }

  // Commerce
  let tradeSection = '';
  if (allTrades.length > 0) {
    tradeSection = `<h2>💰 Échanges commerciaux</h2><table>
      <tr><th>Tick</th><th>Description</th></tr>`;
    allTrades.forEach(t => {
      tradeSection += `<tr><td>${t.tick}</td><td>${t.description}</td></tr>`;
    });
    tradeSection += '</table>';
  } else {
    tradeSection = `<h2>💰 Commerce</h2><p class="meta">Aucun échange commercial réel cette nuit.</p>`;
  }

  // Événements catastrophes
  const allCata = allEvents.filter(e => e.type === 'catastrophe');
  let cataSection = '';
  if (allCata.length > 0) {
    cataSection = `<h2>🌪️ Catastrophes</h2><table><tr><th>Tick</th><th>Description</th></tr>`;
    allCata.forEach(e => { cataSection += `<tr><td>${e.tick}</td><td>${e.description}</td></tr>`; });
    cataSection += '</table>';
  }

  // Lois
  const allLois = allEvents.filter(e => e.type === 'loi');
  let loisSection = '';
  if (allLois.length > 0) {
    loisSection = `<h2>📜 Lois adoptées</h2><table><tr><th>Tick</th><th>Description</th></tr>`;
    allLois.forEach(l => { loisSection += `<tr><td>${l.tick}</td><td>${l.description}</td></tr>`; });
    loisSection += '</table>';
  }

  // Découvertes
  const allDecouvertes = allEvents.filter(e => e.type === 'decouverte');
  let decouvertesSection = '';
  if (allDecouvertes.length > 0) {
    decouvertesSection = `<h2>🔬 Découvertes & Technologies</h2><table><tr><th>Tick</th><th>Description</th></tr>`;
    allDecouvertes.forEach(d => { decouvertesSection += `<tr><td>${d.tick}</td><td>${d.description}</td></tr>`; });
    decouvertesSection += '</table>';
  }

  // Leçons tirées
  const best = sortedVariants[0];
  const worst = sortedVariants[sortedVariants.length - 1];
  const highEchecs = sortedVariants.filter(s => s.echecs > 5);
  const noActivity = sortedVariants.filter(s => s.activityScore <= 2);
  const goodDiplo = sortedVariants.filter(s => s.diplomatie >= 3);

  let lecons = `<h2>📚 Leçons & Analyse des prompts</h2>`;

  lecons += `<div class="lecon"><strong>🏆 Meilleur variant : ${best.variant} (${best.nom})</strong><br>
    Score d'activité ${best.activityScore}/7 — Pop +${best.popGrowth}, territoire +${best.territoryGrowth},
    ${best.explorations} explorations, ${best.constructions} constructions, ${best.diplomatie} actions diplo.</div>`;

  lecons += `<div class="lecon"><strong>⚠️ Variant le moins actif : ${worst.variant} (${worst.nom})</strong><br>
    Score ${worst.activityScore}/7 — ${worst.eventsTotal} events au total.
    ${worst.revoltes > 0 ? `${worst.revoltes} révolte(s).` : ''}
    ${worst.statusFinal === 'dead' ? '❌ Civilisation morte.' : ''}</div>`;

  if (highEchecs.length > 0) {
    lecons += `<div class="lecon"><strong>🔧 Variants avec beaucoup d'échecs :</strong> ${highEchecs.map(s => `${s.variant} (${s.echecs} échecs)`).join(', ')}<br>
      → Ces prompts produisent des intentions mais pas de réalisations. Peut indiquer une trop grande ambition ou une mauvaise gestion des ressources.</div>`;
  }

  if (goodDiplo.length > 0) {
    lecons += `<div class="lecon"><strong>🤝 Variants diplomatiquement actifs :</strong> ${goodDiplo.map(s => `${s.variant} (${s.diplomatie} actions)`).join(', ')}<br>
      → Ces prompts incitent davantage au contact inter-civilisations.</div>`;
  }

  if (noActivity.length > 0) {
    lecons += `<div class="lecon"><strong>💤 Variants peu diversifiés :</strong> ${noActivity.map(s => s.variant).join(', ')}<br>
      → Ces prompts produisent des comportements répétitifs ou peu variés. À retravailler.</div>`;
  }

  if (uniqueRelics.length > 0) {
    const relicVariants = [...new Set(uniqueRelics.map(r => r.owner_variant))].filter(Boolean);
    lecons += `<div class="lecon"><strong>🏺 Impact des reliques :</strong> ${uniqueRelics.length} relique(s) découverte(s) par ${relicVariants.join(', ')}<br>
      → ${uniqueRelics.filter(r => r.taken).length} prise(s), ${uniqueRelics.filter(r => r.used).length} utilisée(s).</div>`;
  }

  if (allTrades.length === 0) {
    lecons += `<div class="lecon"><strong>💰 Commerce : 0 échange réel</strong><br>
      → Aucun variant n'a produit d'échange commercial concret. Le système de commerce nécessite soit un meilleur prompt
      (inciter à finaliser les échanges), soit une correction mécanique (trigger automatique sur contact frontalier marchand).</div>`;
  }

  const deads = sortedVariants.filter(s => s.statusFinal === 'dead');
  if (deads.length > 0) {
    lecons += `<div class="lecon"><strong>💀 Civilisations disparues (${deads.length}) :</strong> ${deads.map(s => `${s.variant} — ${s.nom}`).join(' · ')}<br>
      → ${deads.length > sortedVariants.length / 2 ? 'Plus de la moitié des civs sont mortes. Conditions trop dures ou prompts inadaptés.' : 'Taux de survie acceptable.'}</div>`;
  }

  const topDiscoverer = [...sortedVariants].sort((a, b) => {
    const da = allDecouvertes.filter(e => e.description?.includes(a.nom)).length;
    const db2 = allDecouvertes.filter(e => e.description?.includes(b.nom)).length;
    return db2 - da;
  })[0];
  if (topDiscoverer) {
    const topCount = allDecouvertes.filter(e => e.description?.includes(topDiscoverer.nom)).length;
    if (topCount > 0) {
      lecons += `<div class="lecon"><strong>🔬 Plus grand explorateur intellectuel :</strong> ${topDiscoverer.variant} — ${topDiscoverer.nom} (${topCount} découvertes)<br>
        → Ce variant favorise le développement des connaissances.</div>`;
    }
  }

  // Fiches individuelles
  let fichesSection = `<h2>🏛️ Fiches civilisations</h2>`;
  sortedVariants.forEach(s => {
    const civLast = last.civs.find(c => c.variant === s.variant);
    const civFirst = first.civs.find(c => c.variant === s.variant);
    const civLoisCiv = allLois.filter(e => e.description && e.description.includes(s.nom));
    const civDecouvertesCiv = allDecouvertes.filter(e => e.description && e.description.includes(s.nom));
    const civEpidemies = allEvents.filter(e => e.type === 'epidemie' && e.description && e.description.includes(s.nom));
    const isDead = s.statusFinal === 'dead';
    const gouvernement = civLast?.gouvernement ?? '?';
    const valeursRaw = civLast?.valeurs;
    const valeurs = Array.isArray(valeursRaw) ? valeursRaw.join(', ') : (typeof valeursRaw === 'string' ? valeursRaw : '?');

    fichesSection += `
  <div class="civ-fiche${isDead ? ' dead' : ''}">
    <div class="fiche-header">
      <span class="badge badge-blue">${s.variant}</span>
      <strong>${s.nom}</strong>
      ${isDead ? '<span class="badge badge-red">DISPARUE</span>' : ''}
      <span class="meta" style="font-size:0.85em">${gouvernement}</span>
    </div>
    <div class="fiche-stats">
      <strong>Population :</strong> ${s.popStart} → ${s.popEnd ?? '?'} (${s.popGrowth >= 0 ? '+' : ''}${s.popGrowth ?? '?'}) &nbsp;|&nbsp;
      <strong>Moral :</strong> ${civFirst?.moral ?? '?'} → ${civLast?.moral ?? '?'} &nbsp;|&nbsp;
      <strong>Territoire Δ :</strong> ${s.territoryGrowth >= 0 ? '+' : ''}${s.territoryGrowth ?? '?'} &nbsp;|&nbsp;
      <strong>Armée :</strong> ${civLast?.army ?? 0}<br>
      <strong>Ressources finales :</strong> 🌾 ${civLast?.food ?? 0} &nbsp; 🪵 ${civLast?.bois ?? 0} &nbsp; 🪨 ${civLast?.pierre ?? 0}<br>
      <strong>Valeurs :</strong> ${valeurs}<br>
      <strong>Activité :</strong> ${s.explorations} explor. · ${s.constructions} constru. · ${s.diplomatie} diplo. · ${s.echecs} échecs · ${s.revoltes} révolte(s)
    </div>`;

    if (civLast?.structures?.length > 0) {
      fichesSection += `<div class="fiche-events"><strong>🏗️ Structures principales :</strong><ul>`;
      civLast.structures.slice(0, 8).forEach(s => {
        fichesSection += `<li>${s.role ?? '?'} — ${s.name} ×${s.count} (${s.workers} travailleurs)</li>`;
      });
      fichesSection += `</ul></div>`;
    }

    if (civLoisCiv.length > 0) {
      fichesSection += `<div class="fiche-events"><strong>📜 Lois adoptées :</strong><ul>`;
      civLoisCiv.forEach(l => { fichesSection += `<li>[tick ${l.tick}] ${l.description}</li>`; });
      fichesSection += `</ul></div>`;
    }
    if (civDecouvertesCiv.length > 0) {
      fichesSection += `<div class="fiche-events"><strong>🔬 Découvertes :</strong><ul>`;
      civDecouvertesCiv.forEach(d => { fichesSection += `<li>[tick ${d.tick}] ${d.description}</li>`; });
      fichesSection += `</ul></div>`;
    }
    if (civEpidemies.length > 0) {
      fichesSection += `<div class="fiche-events"><strong>🦠 Épidémies :</strong><ul>`;
      civEpidemies.forEach(e => { fichesSection += `<li>[tick ${e.tick}] ${e.description}</li>`; });
      fichesSection += `</ul></div>`;
    }

    fichesSection += `</div>`;
  });

  // Résumé final
  const totalTicksPlayed = last.tick - first.tick;
  const totalEventsCounted = allEvents.length;
  const uniqueEventTypes = [...new Set(allEvents.map(e => e.type))];

  const summary = `
    <div class="summary-box">
      <h3>Résumé de la nuit</h3>
      <p>Durée : ${snaps.length} snapshots | Ticks joués : ${totalTicksPlayed} (tick ${first.tick} → ${last.tick})</p>
      <p>Événements totaux : ${totalEventsCounted} | Types : ${uniqueEventTypes.join(', ')}</p>
      <p>Reliques découvertes : ${uniqueRelics.length} | Guerres/combats : ${allWars.length} | Échanges commerciaux : ${allTrades.length}</p>
      <p>Relations diplomatiques finales : ${lastDiplo.length} (dont ${lastDiplo.filter(d => d.relation === 'alliance').length} alliances)</p>
    </div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Rapport nuit — WorldIA Civilisations</title>
  <style>${css}</style>
</head>
<body>
<div class="page">
  <h1>🌙 Rapport nocturne — WorldIA Civilisations</h1>
  <p class="meta">${dateStr} | ${tickRange} | ${snaps.length} snapshots horaires | Généré à ${new Date().toLocaleTimeString('fr-FR')}</p>
  ${summary}

  <h2>📊 Tableau comparatif des variants (classé par score d'activité)</h2>
  ${variantTable}

  <h2>📈 Évolution de la population par heure</h2>
  ${popTable}

  <h2>🧠 Évolution du moral par heure</h2>
  ${moralTable}

  ${relicSection}
  ${diploSection}
  ${warSection}
  ${tradeSection}
  ${cataSection}
  ${loisSection}
  ${decouvertesSection}
  ${lecons}
  ${fichesSection}
</div>
</body>
</html>`;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

function msUntilNextReport() {
  const now = new Date();
  const target = new Date(now);
  // --report-at HH ou REPORT_HOUR=HH (ex: 12 pour midi)
  const argAt = process.argv.find(a => a.startsWith('--report-at='))?.split('=')[1]
    || process.env.REPORT_HOUR;
  const reportHour = argAt ? parseInt(argAt, 10) : 22;
  target.setHours(reportHour, 0, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target - now;
}

function msUntilNextHour() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() + 1, 0, 0, 0);
  return next - now;
}

async function main() {
  console.log('🌙 Night Monitor démarré — ' + new Date().toLocaleString('fr-FR'));
  console.log('Snapshots horaires jusqu\'à 6h00, puis rapport PDF.');
  console.log(`Logs → docs/night_logs/`);
  console.log(`PDF → docs/rapport_nuit.pdf\n`);

  // Nettoyer les anciens snapshots pour éviter les mélanges inter-nuits
  const oldFiles = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.json'));
  oldFiles.forEach(f => fs.unlinkSync(path.join(LOGS_DIR, f)));
  if (oldFiles.length > 0) console.log(`  ${oldFiles.length} ancien(s) snapshot(s) supprimé(s)`);

  // Snapshot immédiat au démarrage
  await doHourlyCheck();

  // Snapshot toutes les heures
  function scheduleNextHour() {
    const ms = msUntilNextHour();
    console.log(`\nProchain snapshot dans ${Math.round(ms / 60000)} min`);
    setTimeout(async () => {
      await doHourlyCheck();
      scheduleNextHour();
    }, ms);
  }
  scheduleNextHour();

  // Rapport final à 22h30
  const ms6am = msUntilNextReport();
  console.log(`Rapport final dans ${Math.round(ms6am / 3600000 * 10) / 10}h (à 22h00)`);
  setTimeout(async () => {
    await doHourlyCheck(); // snapshot final avant rapport
    await generateFinalReport();
    console.log('\n✅ Monitoring terminé. Bonne journée !');
    process.exit(0);
  }, ms6am);
}

if (require.main === module) {
  main().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { generateFinalReport, collectSnapshot };
