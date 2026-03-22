// Classement des espèces : population, kills, longévité
import { useState } from 'react';
import Sparkline from './Sparkline.jsx';

const TABS = [
  { key: 'population', label: 'Population', icon: '👥' },
  { key: 'kills', label: 'Kills', icon: '⚔️' },
  { key: 'longevity', label: 'Longévité', icon: '⏳' },
];

export default function RankingPanel({ species, speciesStats, popHistory, onSelectSpecies }) {
  const [tab, setTab] = useState('population');

  // Fusionner les stats dans les espèces
  const enriched = species.map(sp => {
    const st = speciesStats.find(s => s.id === sp.id) || {};
    return { ...sp, total_kills: st.total_kills || 0, ticks_alive: st.ticks_alive || 0 };
  });

  let ranked;
  if (tab === 'population') {
    ranked = [...enriched].sort((a, b) => (b.population || 0) - (a.population || 0));
  } else if (tab === 'kills') {
    ranked = [...enriched].sort((a, b) => (b.total_kills || 0) - (a.total_kills || 0));
  } else {
    ranked = [...enriched].sort((a, b) => (b.ticks_alive || 0) - (a.ticks_alive || 0));
  }

  // Histogramme pour la sparkline par espèce
  function getSparkData(spId) {
    return popHistory
      .filter(p => p.species_id === spId)
      .slice(-20)
      .map(p => p.population);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Classement</h3>
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 text-xs py-1 rounded transition-colors ${tab === t.key ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ranked.length === 0 && (
          <div className="text-xs text-gray-600 text-center py-6">Aucune espèce</div>
        )}
        {ranked.map((sp, i) => {
          const sparkData = getSparkData(sp.id);
          const value = tab === 'population' ? sp.population
            : tab === 'kills' ? sp.total_kills
            : sp.ticks_alive;
          const label = tab === 'population' ? 'ind.' : tab === 'kills' ? 'kills' : 'ticks';

          return (
            <button
              key={sp.id}
              onClick={() => onSelectSpecies?.(sp)}
              className={`w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors border-b border-gray-900 ${sp.status === 'extinct' ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-mono w-4">{i + 1}</span>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sp.color }} />
                <span className="text-xs text-white font-medium flex-1 truncate">{sp.nom}</span>
                <span className="text-xs text-gray-400 font-mono">{value} {label}</span>
              </div>
              {sparkData.length > 1 && (
                <div className="pl-6 mt-1">
                  <Sparkline data={sparkData} color={sp.color} width={120} height={18} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
