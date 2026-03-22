import { useEffect, useRef } from 'react';

const EVENT_STYLES = {
  combat: { icon: '⚔️', color: 'text-red-400', bg: 'bg-red-950/40' },
  extinction: { icon: '💀', color: 'text-purple-400', bg: 'bg-purple-950/40' },
  naissance: { icon: '🐣', color: 'text-green-400', bg: 'bg-green-950/40' },
  milestone: { icon: '🏆', color: 'text-yellow-400', bg: 'bg-yellow-950/40' },
  catastrophe: { icon: '🔥', color: 'text-orange-400', bg: 'bg-orange-950/40' },
  speciation: { icon: '🧬', color: 'text-cyan-400', bg: 'bg-cyan-950/40' },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min`;
  return `${Math.floor(m / 60)}h`;
}

export default function EventFeed({ events, species }) {
  const bottomRef = useRef(null);
  const speciesMap = {};
  for (const sp of (species || [])) {
    speciesMap[sp.id] = sp;
  }

  // Scroll vers le bas à chaque nouvel événement
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events?.length]);

  const sortedEvents = [...(events || [])].sort((a, b) => b.id - a.id);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="text-sm font-semibold text-gray-300">Fil d'événements</h3>
        <span className="text-xs text-gray-500">{sortedEvents.length} évts</span>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {sortedEvents.length === 0 ? (
          <div className="text-center text-gray-600 text-xs mt-8">
            <div className="text-2xl mb-2">🌍</div>
            <div>En attente du premier tick...</div>
          </div>
        ) : (
          sortedEvents.map(ev => {
            const style = EVENT_STYLES[ev.type] || { icon: '📌', color: 'text-gray-400', bg: 'bg-gray-800/40' };
            const involvedSpecies = (ev.species_ids || []).map(id => speciesMap[id]).filter(Boolean);

            return (
              <div key={ev.id} className={`rounded px-2 py-1.5 ${style.bg} border border-white/5`}>
                <div className="flex items-start gap-1.5">
                  <span className="text-sm shrink-0 mt-0.5">{style.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs ${style.color} leading-snug`}>{ev.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {involvedSpecies.map(sp => (
                        <span key={sp.id} className="text-xs flex items-center gap-0.5" style={{ color: sp.color }}>
                          ● {sp.nom}
                        </span>
                      ))}
                      <span className="text-xs text-gray-600 ml-auto shrink-0">
                        Tick {ev.tick}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
