# SESSION_RECAP.md — Bilan de session en cours

> Dense, économise les tokens. Une fois intégré au code → vider ce fichier.

## Session : 2026-03-30

### Fait cette session
- ✅ **Moral guerre** : frustration ×1.0/tick (était ×0.5), plafond supprimé (conforme CLAUDE.md)
- ✅ **Événements de tension de valeur** : `checkValueTensionEvents` dans civEngine.js — seuil 15 (léger) et 30 (fort) pour 11 valeurs, cooldown 10 ticks, colonne `value_event_ticks` en DB
- ✅ **Prompt urgences** : marqueurs 💀/🔥/⚠️ dans civGeminiLLM.js et civOllamaLLM.js
- ✅ **Mémoire structurée** : 5 domaines (identite/savoir/diplomatie/pressions/histoire), max 8 entrées FIFO, moteur seul, chargement sélectif, format identique Gemini+Ollama. Colonne `civ_memory`, `addMemoryEntry` exportée, triggers complets.
- ✅ **Validation des valeurs** : liste canonique des 11 valeurs. Validation dans `civSeed.js` et route POST `/api/civs`, remplacement des valeurs inconnues par `survie` avec warning.
- ✅ **Satisfactions affichées dans le prompt** (Ollama + Gemini) — LLM voit ses réussites
- ✅ **Fix condition commerce** : satisfaite si voisin connu OU route active (moralSystem.js)
- ✅ **Suppression `connaissance` des tension events** — alias fantôme retiré (civEngine.js)
- ✅ **Énergie divine + Souhaits — backend** : colonnes `energy` + `current_wish` DB, accumulation +3/tick/valeur satisfaite cap 200, `SOUHAIT:` parsé depuis LLM, route `POST /api/civs/:id/intervene` (9 actions)
- ✅ **Frontend énergie divine** : CivCard.jsx — barre énergie, souhait affiché, 9 boutons interventions
- ✅ **Audit last_consequences** : 4 bugs corrigés — `premier_contact` écrit en DB, `animal_decouvert` + `chasse` affichés dans LLM, `homeless_deaths` exposé depuis `buildCivContext`
- ✅ **Fix LLM non déclenché** : `surplus < 0` ajouté dans `needsDecision`, `CRÉER` 0 workers bloqué, `last_consequences` mergé au lieu d'écrasé
- ✅ **Fix armée > pop** : `newSoldiers = min(army, floor(pop * 0.6))` dans civEngine.js Étape 1
- ✅ **Prescription guerre supprimée** : phrase moraliste retirée de moralSystem.js + ligne ARMÉE neutre dans civGeminiLLM.js
- ✅ **Section ARMÉE ajoutée dans civOllamaLLM.js** + `last_combat_tick` exposé dans `buildCivContext`
- ✅ **Reliques visibles juste avant la décision** : `getTexteReliquesPossedees`, filtre `used=0, taken=1`, section omise si vide
- ✅ **`peaux` et `os` affichés même à 0** dans Ollama + Gemini
- ✅ **Reliques par niveau techno** : `getCivEra`, `ERA_ORDER`, `discoverRelicsInTerritory` refaite (diff>1→ignorée, diff=1→incomprise+mémoire, diff=0→normale)
- ✅ **Fix dépendance circulaire** : `addMemoryEntry` déplacée vers `civActionResolver.js`
- ✅ **Spawn civs rapproché** : capitales à (115,80) et (135,80)
- ✅ **Érudits** : valeurs corrigées → `savoir`, `art`, `commerce` (suppression culture/technologie fantômes)
- ✅ **`premier_contact` symétrique** : `last_consequences` + `addMemoryEntry` pour `foundCiv` aussi (civEngine.js ~ligne 916)

### Toutes les tâches pour Roo Code (PRÊTES À CODER — dans cet ordre)

#### 🔴 Spec 1 — Attaques animales non déclenchées (civEngine.js, 2 lignes)
Le code d'attaque dans `updateAnimalGroups` existe et écrit bien `{ type: 'attaque_animaux' }` dans `last_consequences`. Mais `needsDecision` ne le vérifie pas → LLM jamais déclenché.

**Fix** dans `civEngine.js`, section needsDecision (~ligne 965) :
```js
// Ajouter :
const hasAnimalAttack = lastConseqs.some(c => c.type === 'attaque_animaux');
// Modifier needsDecision :
const needsDecision = isIdle || isFamine || isUnderAttack || hasAnimalAttack || (hasNoHousing && ['automne', 'hiver'].includes(season)) || hasRelicDiscovered || hasFirstContact || foodSurplus < 0;
// Modifier reason :
const reason = isIdle ? 'idle' : isFamine ? 'FAMINE' : isUnderAttack ? 'SOUS_ATTAQUE' : hasAnimalAttack ? 'ATTAQUE_ANIMAUX' : foodSurplus < 0 ? 'DEFICIT' : hasRelicDiscovered ? 'RELIQUE' : hasFirstContact ? 'PREMIER_CONTACT' : 'URGENT_LOGEMENT';
```

#### 🔴 Spec 2 — Verb ATTAQUER manquant (frustration guerre perpétuelle)
`DIPLOMATIE guerre →` fonctionne mécaniquement mais le LLM ne le voit pas comme option directe, et les résultats de combat ne sont jamais écrits dans `last_consequences` → le LLM ne sait jamais qu'il a gagné/perdu.

**Fichiers touchés** : `civOllamaLLM.js`, `civGeminiLLM.js`, `civActionResolver.js`

**A. civOllamaLLM.js + civGeminiLLM.js** — 3 points chacun :
1. Ajouter `'ATTAQUER'` dans `VERBES_VALIDES`
2. Ajouter dans la liste des verbes du prompt : `- ATTAQUER [nom_civ] (déclarer la guerre et mener un assaut immédiat)`
3. Ajouter dans `parseAction` :
   ```js
   case 'ATTAQUER': {
     const tgt = p.trim();
     return tgt ? `ATTAQUER ${tgt}` : 'RIEN';
   }
   ```
4. Dans la section conséquences, ajouter le cas `combat` :
   ```js
   } else if (c.type === 'combat') {
     lines.push(c.description);
   }
   ```

**B. civActionResolver.js** — 2 points :
1. Dans `parseEffets`, ajouter avant le bloc `ENVOYER_MARCHANDS` :
   ```js
   } else if (/^ATTAQUER\b/i.test(main)) {
     const m = main.match(/^ATTAQUER\s+(.+)$/i);
     if (m) effects.push({ verb: 'ATTAQUER', target_name: m[1].trim(), params });
   ```
2. Dans `resolveEffect`, ajouter le `case 'ATTAQUER'` (voir spec complète ci-dessous)

**case 'ATTAQUER' complet** (à placer avant `case 'ESPIONNER'`) :
```js
case 'ATTAQUER': {
  const targetName = (effect.target_name || '').trim();
  const targetCiv = allCivs.find(c =>
    c.nom.toLowerCase() === targetName.toLowerCase() ||
    c.nom.toLowerCase().includes(targetName.toLowerCase())
  );
  if (!targetCiv || targetCiv.id === civ.id) {
    events.push({ type: 'echec', description: `${civ.nom} : cible "${targetName}" introuvable.`, civ_ids: [civ.id] });
    break;
  }
  const result = resolveWar(civ, targetCiv, worldId, events);
  // Attaquant
  updates.military_power = Math.max(5, (civ.military_power || 0) - result.atkMilitaryLoss);
  updates.moral          = clamp((civ.moral || 70) + result.atkMoralChange, 0, 100);
  updates.army_soldiers  = Math.max(0, (civ.army_soldiers || 0) - Math.floor(result.atkMilitaryLoss * 0.5));
  updates.last_combat_tick = currentTick;
  // Défenseur
  db.prepare('UPDATE civilizations SET military_power=MAX(5,military_power-?), moral=MAX(0,MIN(100,moral+?)), army_soldiers=MAX(0,army_soldiers-?), last_combat_tick=? WHERE id=?')
    .run(result.defMilitaryLoss, result.defMoralChange, Math.floor(result.defMilitaryLoss * 0.5), currentTick, targetCiv.id);
  // Diplomatie
  const pairMin = Math.min(civ.id, targetCiv.id);
  const pairMax = Math.max(civ.id, targetCiv.id);
  db.prepare('INSERT OR REPLACE INTO diplomacy (world_id, civ_a_id, civ_b_id, relation) VALUES (?,?,?,?)')
    .run(worldId, pairMin, pairMax, 'guerre');
  // last_consequences attaquant
  const atkConseqs = parseJ(civ.last_consequences, []);
  atkConseqs.push({
    type: 'combat', victoire: result.atkWins, adversaire: targetCiv.nom,
    pertes: Math.floor(result.atkMilitaryLoss * 0.5),
    description: result.atkWins
      ? `Victoire contre ${targetCiv.nom} ! Vos soldats ont brisé leurs lignes et pris des territoires.`
      : `Défaite contre ${targetCiv.nom}. Vos troupes ont été repoussées avec de lourdes pertes.`,
  });
  db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?').run(JSON.stringify(atkConseqs), civ.id);
  // last_consequences défenseur
  const defConseqs = parseJ(targetCiv.last_consequences, []);
  defConseqs.push({
    type: 'combat', victoire: !result.atkWins, adversaire: civ.nom,
    pertes: Math.floor(result.defMilitaryLoss * 0.5),
    description: result.atkWins
      ? `${civ.nom} a envahi votre territoire. Des terres ont été perdues.`
      : `Vous avez repoussé l'attaque de ${civ.nom} !`,
  });
  db.prepare('UPDATE civilizations SET last_consequences=? WHERE id=?').run(JSON.stringify(defConseqs), targetCiv.id);
  // Mémoire
  addMemoryEntry(civ.id, 'diplomatie', `An ${Math.floor(currentTick/12)+1} — ${result.atkWins ? 'Victoire' : 'Défaite'} contre ${targetCiv.nom}.`);
  addMemoryEntry(targetCiv.id, 'diplomatie', `An ${Math.floor(currentTick/12)+1} — ${result.atkWins ? 'Attaque subie' : 'Résistance'} face à ${civ.nom}.`);
  addMemoryEntry(civ.id, 'histoire', `An ${Math.floor(currentTick/12)+1} — Bataille contre ${targetCiv.nom}.`);
  break;
}
```

#### 🔴 Spec 3 — Moral guerre sans soldats réels (moralSystem.js)

**Fichier** : `backend/src/simulation/moralSystem.js`

Remplacer le bloc `guerre` (~ligne 33) :
```js
// AVANT
guerre: {
  satisfied:    (c, tick) => (c.last_combat_tick || 0) > 0 && tick - (c.last_combat_tick || 0) < 20,
  frustrated:   (c, tick) => (c.last_combat_tick || 0) === 0 && (c._known_count || 0) > 0,
  satisfiedText:  'Ton armée a prouvé sa valeur au combat',
  moralBonus: +8, moralMalus: -10,
},
// APRÈS
guerre: {
  satisfied:    (c, tick) => (c.army_soldiers || 0) > 0 && (c.last_combat_tick || 0) > 0 && tick - (c.last_combat_tick || 0) < 20,
  frustrated:   (c, tick) => (c._known_count || 0) > 0 && (c.army_soldiers || 0) === 0,
  satisfiedText:  'Ton armée a prouvé sa valeur au combat',
  frustratedText: "Ton peuple belliqueux n'a pas d'armée pour défendre ses ambitions",
  moralBonus: +8, moralMalus: -10,
},
```

---

#### 🧪 Specs 4→12 — Expérience 10 variants de prompts

> Spec technique complète dans `docs/PROMPT_VARIANTS_SPEC.md`. Lire ce fichier en entier avant de commencer.

**Ordre d'exécution strict :**

**4.** `backend/scripts/migrate.js` — ajouter colonne `prompt_variant` + table `civ_snapshots` (section 2 du spec)

**5.** Créer `backend/src/llm/civPromptVariants.js` — code complet en section 5 du spec

**6.** `backend/src/llm/civOllamaLLM.js` — renommer buildPrompt→buildPromptV0, import civPromptVariants, nouvelle buildPrompt + constante FORMAT_OLLAMA (section 4)

**7.** `backend/src/llm/civGeminiLLM.js` — idem pour Gemini (section 4)

**8.** `backend/src/simulation/civActionResolver.js` — ajouter `prompt_variant: civ.prompt_variant || 'V0'` dans le retour de buildCivContext

**9.** `backend/src/simulation/civEngine.js` — ajouter le bloc snapshot après la boucle LLM (section 3 du spec)

**10.** `backend/scripts/civSeed.js` — remplacer DEMO_CIVS par les 10 civs + ajouter prompt_variant dans INSERT (section 6)

**11.** `.env` — ajouter `TICK_INTERVAL_MS=60000` et `SNAPSHOT_INTERVAL_TICKS=20`

**12.** Créer `backend/scripts/analyzeVariants.js` (section 7 du spec)

---

### Autres bugs ouverts
- 🟡 `chat-server.js` à la racine — usage inconnu, à investiguer

### Backlog
- 🗂️ Protocole "Bring your own agent"
- 🏺 Reliques pondérées selon niveau techno
- 🏰 Remparts sans logique spatiale
- 🐺 Diversité réponses animaux agressifs
- 🎨 Sprites bâtiments
- ⏳ Durée de vie bâtiments
- 🧠 Simulation des habitants (artisans / soldats / paysans)

### Notes permanentes
- Route civs : `/api/civs` (pas `/api/civilizations`)
- Procédure reset : `POST /api/civs/reset` → `node backend/scripts/civSeed.js` → redémarrer backend
- 14 ressources : `nourriture bois pierre glaise silex sable sel cuivre etain fer or charbon peaux os`
