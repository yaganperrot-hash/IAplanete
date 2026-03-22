import { useState, useEffect } from 'react';
import { createSpecies, previewStats } from '../api/index.js';

const BIOMES = [
  'tropical_forest', 'temperate_forest', 'savanna', 'desert_hot', 'desert_cold',
  'mountain', 'hills', 'volcano', 'swamp', 'coast', 'reef', 'prairie', 'tundra',
];

const TRAITS = [
  { id: 'camouflage', label: 'Camouflage', desc: 'Quasi invisible dans son biome (+discrétion)' },
  { id: 'venin', label: 'Venin', desc: 'Attaque empoisonnée (+60% dégâts, coût énergie)' },
  { id: 'carapace', label: 'Carapace', desc: 'Résistance (+60% PV), ralenti' },
  { id: 'vitesse', label: 'Vitesse', desc: 'Déplacement rapide (+1 case, coût énergie)' },
  { id: 'vol', label: 'Vol', desc: 'Déplacement aérien (+vitesse, doit se poser pour manger)' },
  { id: 'echolocation', label: 'Écholocation', desc: 'Détecte les créatures cachées (+portée)' },
  { id: 'vision_nocturne', label: 'Vision nocturne', desc: 'Pas de pénalité la nuit (+portée)' },
  { id: 'resistance_froid', label: 'Résist. froid', desc: 'Supporte les biomes froids sans pénalité' },
  { id: 'resistance_chaleur', label: 'Résist. chaleur', desc: 'Supporte les biomes chauds sans pénalité' },
  { id: 'fouisseur', label: 'Fouisseur', desc: 'Peut se cacher sous terre (+discrétion), lent en surface' },
  { id: 'mimetisme', label: 'Mimétisme', desc: 'Imite une espèce dangereuse (+discrétion)' },
  { id: 'bioluminescence', label: 'Bioluminescence', desc: 'Attire les proies dans l\'obscurité (+détection)' },
];

function StatPreview({ stats }) {
  if (!stats) return null;
  const bars = [
    { label: 'PV', value: stats.points_vie, max: 160, color: '#22c55e' },
    { label: 'Dégâts', value: stats.degats, max: 100, color: '#ef4444' },
    { label: 'Conso énergie', value: stats.consommation_energie, max: 30, color: '#f59e0b' },
    { label: 'Détection', value: stats.portee_detection, max: 20, color: '#3b82f6' },
    { label: 'Discrétion', value: stats.discretion, max: 20, color: '#8b5cf6' },
    { label: 'Reprod/tick', value: stats.vitesse_reproduction, max: 40, color: '#ec4899' },
  ];
  return (
    <div className="bg-gray-900 rounded p-3 space-y-2">
      <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Aperçu stats</div>
      {bars.map(b => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-500 w-24 shrink-0">{b.label}</span>
          <div className="flex-1 bg-gray-800 rounded-full h-1.5">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (b.value / b.max) * 100)}%`, background: b.color }} />
          </div>
          <span className="text-xs font-mono text-gray-400 w-8 text-right">{b.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function SpeciesForm({ onCreated, onClose, spawnCoords }) {
  const [form, setForm] = useState({
    nom: '', creator_name: '',
    milieu: 'terrestre', taille: 4,
    regime: 'herbivore', habitats: [],
    social: 'petit_groupe', rythme: 'diurne',
    traits: [], description: '',
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Prévisualiser les stats en temps réel
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const data = await previewStats(form);
        if (data.stats) setStats(data.stats);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [form.taille, form.regime, form.social, form.traits]);

  function set(key, value) {
    setForm(f => ({ ...f, [key]: value }));
  }

  function toggleHabitat(biome) {
    setForm(f => {
      const h = f.habitats.includes(biome)
        ? f.habitats.filter(b => b !== biome)
        : f.habitats.length < 3 ? [...f.habitats, biome] : f.habitats;
      return { ...f, habitats: h };
    });
  }

  function toggleTrait(traitId) {
    setForm(f => {
      const t = f.traits.includes(traitId)
        ? f.traits.filter(t => t !== traitId)
        : f.traits.length < 2 ? [...f.traits, traitId] : f.traits;
      return { ...f, traits: t };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await createSpecies({
        ...form,
        spawn_x: spawnCoords?.x ?? 40,
        spawn_y: spawnCoords?.y ?? 30,
      });
      if (data.error) { setError(data.error); return; }
      onCreated?.(data.species); // onCreated ferme le formulaire en changeant rightPanel
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('fetch') || msg.includes('Failed') || msg.includes('NetworkError') || msg.includes('JSON')) {
        setError('Serveur injoignable — relance npm run dev');
      } else {
        setError(msg || 'Erreur inconnue');
      }
    } finally {
      setLoading(false); // toujours exécuté
    }
  }

  const label = 'block text-xs text-gray-400 mb-1';
  const input = 'w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500';
  const select = input;
  const btnOption = (active) => `px-2 py-1 rounded text-xs cursor-pointer border transition-colors ${active ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`;

  const TAILLE_LABELS = { 1: 'Insecte', 2: 'Souris', 3: 'Renard', 4: 'Renard+', 5: 'Loup', 6: 'Loup+', 7: 'Ours', 8: 'Ours+', 9: 'Éléphant', 10: 'Géant' };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <h3 className="text-sm font-semibold text-white">Créer une espèce</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg">×</button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Nom + Créateur */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={label}>Nom de l'espèce *</label>
            <input className={input} value={form.nom} onChange={e => set('nom', e.target.value)} placeholder="ex: Raptor Vert" required maxLength={50} />
          </div>
          <div>
            <label className={label}>Votre nom</label>
            <input className={input} value={form.creator_name} onChange={e => set('creator_name', e.target.value)} placeholder="Créateur" maxLength={30} />
          </div>
        </div>

        {/* Milieu */}
        <div>
          <label className={label}>Milieu de vie</label>
          <div className="flex gap-2">
            {['terrestre', 'aquatique', 'amphibie', 'aérien'].map(m => (
              <button key={m} type="button" onClick={() => set('milieu', m)} className={btnOption(form.milieu === m)}>
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Taille */}
        <div>
          <label className={label}>Taille : <span className="text-white">{form.taille}/10 — {TAILLE_LABELS[form.taille]}</span></label>
          <input type="range" min={1} max={10} value={form.taille} onChange={e => set('taille', parseInt(e.target.value))}
            className="w-full accent-blue-500" />
        </div>

        {/* Régime */}
        <div>
          <label className={label}>Régime alimentaire</label>
          <div className="flex flex-wrap gap-2">
            {['herbivore', 'carnivore', 'omnivore', 'charognard', 'insectivore', 'parasite'].map(r => (
              <button key={r} type="button" onClick={() => set('regime', r)} className={btnOption(form.regime === r)}>{r}</button>
            ))}
          </div>
        </div>

        {/* Habitats */}
        <div>
          <label className={label}>Habitats préférés <span className="text-gray-600">(max 3)</span></label>
          <div className="flex flex-wrap gap-1.5">
            {BIOMES.map(b => (
              <button key={b} type="button" onClick={() => toggleHabitat(b)}
                className={`px-1.5 py-0.5 rounded text-xs cursor-pointer border transition-colors ${form.habitats.includes(b) ? 'bg-green-700 border-green-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                {b.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Social */}
        <div>
          <label className={label}>Mode de vie social</label>
          <div className="flex flex-wrap gap-2">
            {['solitaire', 'couple', 'petit_groupe', 'grande_colonie'].map(s => (
              <button key={s} type="button" onClick={() => set('social', s)} className={btnOption(form.social === s)}>
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Rythme */}
        <div>
          <label className={label}>Rythme d'activité</label>
          <div className="flex gap-2">
            {['diurne', 'nocturne', 'crépusculaire'].map(r => (
              <button key={r} type="button" onClick={() => set('rythme', r)} className={btnOption(form.rythme === r)}>{r}</button>
            ))}
          </div>
        </div>

        {/* Traits */}
        <div>
          <label className={label}>Traits spéciaux <span className="text-gray-600">(max 2 — {form.traits.length}/2)</span></label>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
            {TRAITS.map(t => (
              <button key={t.id} type="button" onClick={() => toggleTrait(t.id)}
                className={`text-left px-2 py-1.5 rounded border transition-colors ${form.traits.includes(t.id) ? 'bg-purple-800 border-purple-600' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                disabled={!form.traits.includes(t.id) && form.traits.length >= 2}>
                <div className="text-xs font-semibold text-white">{t.label}</div>
                <div className="text-xs text-gray-400">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Zone de spawn */}
        <div>
          <label className={label}>Zone de spawn</label>
          {spawnCoords ? (
            <div className="flex items-center gap-2 bg-green-900/40 border border-green-700/60 rounded px-2 py-1.5 text-xs text-green-300">
              <span className="text-green-400">◎</span>
              <span>Coordonnées : ({spawnCoords.x}, {spawnCoords.y})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-500">
              <span>←</span>
              <span>Clique sur la carte pour choisir la zone de spawn</span>
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className={label}>Description libre <span className="text-gray-600">(optionnel)</span></label>
          <textarea className={`${input} resize-none`} rows={2} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Influence la personnalité de l'IA..." maxLength={200} />
        </div>

        {/* Aperçu stats */}
        <StatPreview stats={stats} />

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button type="submit" disabled={loading || !form.nom.trim()}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 rounded text-sm transition-colors">
          {loading ? 'Création...' : '🌱 Lancer l\'espèce dans le monde'}
        </button>
      </form>
    </div>
  );
}
