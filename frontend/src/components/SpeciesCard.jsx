import { useState, useEffect } from 'react';
import { fetchSpeciesDetail } from '../api/index.js';
import Sparkline from './Sparkline.jsx';

const ACTION_ICONS = {
  SE_DEPLACER: '🚶', MANGER: '🌿', CHASSER: '⚔️', FUIR: '💨',
  SE_CACHER: '👁️', SE_REPRODUIRE: '💞', DORMIR: '😴', EXPLORER: '🗺️',
  DEFENDRE_TERRITOIRE: '🛡️', ATTAQUER: '⚔️', SUIVRE: '👥', RIEN: '💭',
};

const REGIME_PREY = {
  carnivore: ['herbivore'],
  omnivore: ['herbivore'],
  charognard: [],
  herbivore: [],
  insectivore: [],
};

function StatBar({ label, value, max = 100, color = 'bg-blue-500' }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-8 text-right font-mono">{value}</span>
    </div>
  );
}

export default function SpeciesCard({ species, creatures, allSpecies, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!species) return;
    setLoading(true);
    fetchSpeciesDetail(species.id)
      .then(data => { setDetail(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [species?.id]);

  if (!species) return null;

  const params = species.params || {};
  const stats = species.stats || {};
  const aliveCount = creatures?.filter(c => c.species_id === species.id && c.status === 'alive').length ?? species.population;
  const isExtinct = species.status === 'extinct';

  // Sparkline données de population
  const popData = (detail?.pop_history || []).map(p => p.population);
  const peakPop = popData.length > 0 ? Math.max(...popData) : 0;

  // Chaîne alimentaire (heuristique basée sur le régime)
  const preyRegimes = REGIME_PREY[params.regime] || [];
  const prey = (allSpecies || []).filter(s =>
    s.id !== species.id &&
    preyRegimes.includes((s.params || {}).regime)
  );
  const predators = (allSpecies || []).filter(s => {
    const sr = (s.params || {}).regime || '';
    const myRegime = params.regime || '';
    const srPrey = REGIME_PREY[sr] || [];
    return s.id !== species.id && srPrey.includes(myRegime);
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: species.color }} />
          <span className="font-semibold text-sm text-white">{species.nom}</span>
          {isExtinct && <span className="text-xs text-red-500 font-mono">☠ ÉTEINTE</span>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Statut + population */}
        <div className="text-xs text-gray-500 space-y-0.5">
          <div>Créé par <span className="text-gray-300">{species.creator_name}</span></div>
          {species.description && <div className="text-gray-400 italic">"{species.description}"</div>}
          {!isExtinct ? (
            <div className="font-semibold text-green-400">✓ Vivante · {aliveCount} individus</div>
          ) : (
            <div className="space-y-0.5">
              <div className="font-semibold text-red-400">✗ Éteinte</div>
              {species.extinct_at && (
                <div className="text-gray-600">Extinction : {new Date(species.extinct_at).toLocaleString()}</div>
              )}
              {peakPop > 0 && <div className="text-gray-500">Population max atteinte : {peakPop}</div>}
              {species.total_kills > 0 && <div className="text-gray-500">Kills totaux : {species.total_kills}</div>}
              {species.ticks_alive > 0 && <div className="text-gray-500">Survécu {species.ticks_alive} ticks</div>}
            </div>
          )}
        </div>

        {/* Sparkline population */}
        {popData.length > 1 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">Évolution population</h4>
            <div className="flex items-end gap-2">
              <Sparkline data={popData} color={species.color} width={160} height={36} />
              <div className="text-xs text-gray-500 font-mono">
                <div>max: {peakPop}</div>
                <div>now: {popData[popData.length - 1] || 0}</div>
              </div>
            </div>
          </div>
        )}

        {/* Stats rapides */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-900 rounded p-2 text-center">
            <div className="text-yellow-400 font-bold text-base">{species.total_kills || 0}</div>
            <div className="text-gray-500">kills</div>
          </div>
          <div className="bg-gray-900 rounded p-2 text-center">
            <div className="text-blue-400 font-bold text-base">{aliveCount}</div>
            <div className="text-gray-500">vivants</div>
          </div>
          <div className="bg-gray-900 rounded p-2 text-center">
            <div className="text-purple-400 font-bold text-base">{species.ticks_alive || 0}</div>
            <div className="text-gray-500">ticks</div>
          </div>
        </div>

        {/* Paramètres */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Caractéristiques</h4>
          <div className="grid grid-cols-2 gap-1 text-xs text-gray-300">
            <div><span className="text-gray-500">Milieu:</span> {params.milieu}</div>
            <div><span className="text-gray-500">Taille:</span> {params.taille}/10</div>
            <div><span className="text-gray-500">Régime:</span> {params.regime}</div>
            <div><span className="text-gray-500">Vie sociale:</span> {params.social}</div>
            <div><span className="text-gray-500">Rythme:</span> {params.rythme}</div>
            <div><span className="text-gray-500">Habitats:</span> {(params.habitats || []).join(', ') || '—'}</div>
          </div>
          {(params.traits || []).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {params.traits.map(t => (
                <span key={t} className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-xs">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Stats calculées */}
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Stats calculées</h4>
          <div className="space-y-1.5">
            <StatBar label="Points de vie" value={stats.points_vie} max={160} color="bg-green-600" />
            <StatBar label="Dégâts" value={stats.degats} max={100} color="bg-red-600" />
            <StatBar label="Énergie/tick" value={stats.consommation_energie} max={30} color="bg-yellow-600" />
            <StatBar label="Portée détection" value={stats.portee_detection} max={20} color="bg-blue-600" />
            <StatBar label="Discrétion" value={stats.discretion} max={20} color="bg-purple-600" />
            <StatBar label="Cooldown repro." value={stats.vitesse_reproduction} max={40} color="bg-pink-600" />
          </div>
        </div>

        {/* Chaîne alimentaire */}
        {(prey.length > 0 || predators.length > 0) && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Chaîne alimentaire</h4>
            {predators.length > 0 && (
              <div className="mb-1.5">
                <span className="text-xs text-red-400 font-semibold">Prédateurs :</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {predators.map(s => (
                    <span key={s.id} className="flex items-center gap-1 bg-red-900/30 border border-red-800/30 text-xs text-red-300 px-1.5 py-0.5 rounded">
                      <span style={{ color: s.color }}>●</span> {s.nom}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {prey.length > 0 && (
              <div>
                <span className="text-xs text-green-400 font-semibold">Proies :</span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {prey.map(s => (
                    <span key={s.id} className="flex items-center gap-1 bg-green-900/30 border border-green-800/30 text-xs text-green-300 px-1.5 py-0.5 rounded">
                      <span style={{ color: s.color }}>●</span> {s.nom}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Journal de pensées */}
        {loading ? (
          <div className="text-xs text-gray-600 text-center py-2">Chargement...</div>
        ) : detail?.thoughts?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Journal de pensées</h4>
            <div className="space-y-1.5">
              {detail.thoughts.slice(0, 6).map((t, i) => (
                <div key={i} className="bg-gray-900 rounded px-2 py-1.5">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs">{ACTION_ICONS[t.action] || '💭'}</span>
                    <span className="text-xs font-mono text-gray-400">{t.action}</span>
                    <span className="text-xs text-gray-600 ml-auto">T{t.tick}</span>
                  </div>
                  <p className="text-xs text-gray-300 italic leading-snug">"{t.raison}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Événements récents */}
        {detail?.events?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-400 uppercase mb-2">Événements</h4>
            <div className="space-y-1">
              {detail.events.slice(0, 5).map(ev => (
                <div key={ev.id} className="text-xs text-gray-400 border-l-2 pl-2" style={{ borderColor: species.color }}>
                  {ev.description}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
