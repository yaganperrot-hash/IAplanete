import { useState } from 'react';

const VALEURS_OPTIONS = [
  { id: 'expansion', label: 'Expansion', icon: '⚔️' },
  { id: 'commerce', label: 'Commerce', icon: '💰' },
  { id: 'savoir', label: 'Savoir', icon: '📚' },
  { id: 'guerre', label: 'Guerre', icon: '🗡️' },
  { id: 'spiritualite', label: 'Spiritualité', icon: '🕊️' },
  { id: 'isolationnisme', label: 'Isolationnisme', icon: '🏔️' },
  { id: 'liberte', label: 'Liberté', icon: '🦅' },
  { id: 'ordre', label: 'Ordre', icon: '⚖️' },
  { id: 'survie', label: 'Survie', icon: '🌿' },
  { id: 'exploration', label: 'Exploration', icon: '🧭' },
  { id: 'art_culture', label: 'Art & Culture', icon: '🎨' },
  { id: 'technologie', label: 'Technologie', icon: '⚙️' },
];

const GOUVERNEMENTS = [
  { id: 'monarchie', label: 'Monarchie', desc: 'Décision rapide, successions risquées' },
  { id: 'democratie', label: 'Démocratie', desc: 'Décision lente, moral élevé' },
  { id: 'theocratie', label: 'Théocratie', desc: 'Forte culture, rigide' },
  { id: 'conseil_anciens', label: 'Conseil des anciens', desc: 'Sage, lent à réagir' },
  { id: 'dictature_militaire', label: 'Dictature militaire', desc: 'Très puissant, fragile' },
  { id: 'anarchie_cooperative', label: 'Anarchie coopérative', desc: 'Innovant, imprévisible' },
];

export default function CivForm({ onCreated, onClose, spawnCoords }) {
  const [nom, setNom] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [valeurs, setValeurs] = useState([]);
  const [gouvernement, setGouvernement] = useState('monarchie');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function toggleValeur(v) {
    setValeurs(prev => {
      if (prev.includes(v)) return prev.filter(x => x !== v);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, v];
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nom.trim()) { setError('Le nom est requis'); return; }
    if (valeurs.length < 1) { setError('Choisissez au moins 1 valeur'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('http://localhost:4000/api/civs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: nom.trim(),
          creator_name: creatorName || 'Inconnu',
          valeurs, gouvernement, description,
          spawn_x: spawnCoords?.x,
          spawn_y: spawnCoords?.y,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Erreur serveur'); return; }
      onCreated(data.civ);
    } catch (err) {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <span className="text-sm font-semibold text-amber-400">Nouvelle Civilisation</span>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Nom de la civilisation *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="L'Empire du Soleil..."
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Votre nom (créateur)</label>
          <input value={creatorName} onChange={e => setCreatorName(e.target.value)} placeholder="Anonyme"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Valeurs fondatrices (1-3) *</label>
          <div className="grid grid-cols-2 gap-1">
            {VALEURS_OPTIONS.map(v => (
              <button key={v.id} type="button" onClick={() => toggleValeur(v.id)}
                className={`text-left px-2 py-1.5 rounded text-xs border transition-all flex items-center gap-1.5
                  ${valeurs.includes(v.id) ? 'bg-amber-900/50 border-amber-500 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                <span>{v.icon}</span> {v.label}
              </button>
            ))}
          </div>
          <div className="text-xs text-gray-600 mt-1">{valeurs.length}/3 sélectionnées</div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Gouvernement</label>
          <div className="space-y-1">
            {GOUVERNEMENTS.map(g => (
              <button key={g.id} type="button" onClick={() => setGouvernement(g.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs border transition-all
                  ${gouvernement === g.id ? 'bg-amber-900/50 border-amber-500 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                <span className="font-medium text-white">{g.label}</span>
                <span className="text-gray-500 ml-1">— {g.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Personnalité du dirigeant (optionnel)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Un peuple fier qui préfère la gloire à la prudence..."
            rows={3}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500 resize-none" />
        </div>

        {spawnCoords && (
          <div className="text-xs text-amber-400 bg-amber-900/20 rounded px-2 py-1.5">
            Capitale : ({spawnCoords.x}, {spawnCoords.y}) — cliquez sur la carte pour changer
          </div>
        )}

        {error && <div className="text-xs text-red-400 bg-red-900/20 rounded px-2 py-1.5">{error}</div>}

        <button type="submit" disabled={loading}
          className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm py-2 rounded font-medium transition-colors">
          {loading ? 'Création...' : 'Fonder la civilisation'}
        </button>
      </form>
    </div>
  );
}
