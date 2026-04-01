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