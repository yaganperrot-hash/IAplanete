const RESOURCE_ICONS = {
  nourriture: '🍞', bois: '🪵', pierre: '🪨', glaise: '🧱',
  silex: '🔩', sable: '⏳', sel: '🧂', cuivre: '🟤',
  etain: '⬜', fer: '⚙️', or: '🟡', charbon: '🖤',
};

const RESOURCE_COLORS = {
  nourriture: 'bg-green-500', bois: 'bg-amber-700', pierre: 'bg-gray-500', glaise: 'bg-orange-700',
  silex: 'bg-gray-400', sable: 'bg-yellow-300', sel: 'bg-white', cuivre: 'bg-orange-400',
  etain: 'bg-slate-300', fer: 'bg-slate-600', or: 'bg-yellow-400', charbon: 'bg-gray-800',
};

const EQUIPMENT_LABELS = {
  primitif: 'aucun', neolithique: 'silex', bronze: 'bronze', fer: 'fer',
  classique: 'fer', medieval: 'acier', industriel: 'acier', moderne: 'acier avancé', spatial: 'technologie',
};

const GOV_LABELS = {
  monarchie: 'Monarchie',
  democratie: 'Démocratie',
  theocratie: 'Théocratie',
  conseil_anciens: 'Conseil des anciens',
  dictature_militaire: 'Dictature militaire',
  anarchie_cooperative: 'Anarchie coopérative',
};

const AGE_LABELS = {
  primitif: '🪨 Primitif',
  neolithique: '🌾 Néolithique',
  bronze: '🥉 Bronze',
  fer: '⚔️ Fer',
  classique: '🏛️ Classique',
};

const RELATION_LABELS = {
  neutre: { label: 'Neutre', color: 'text-gray-400' },
  commerce: { label: 'Commerce', color: 'text-yellow-400' },
  alliance: { label: 'Alliance', color: 'text-green-400' },
  guerre: { label: 'Guerre', color: 'text-red-400' },
};

function StatBar({ label, value, max = 100, color = 'bg-amber-500' }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-gray-400">{label}</span>
        <span className="text-white">{Math.round(value)}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CivCard({ civ, allCivs, thoughtLogs, onClose }) {
  const recentThoughts = thoughtLogs.filter(t => t.civ_id === civ.id).slice(0, 3);

  // Trouver les relations diplomatiques (depuis les logs d'événements ou données passées)
  // Pour l'instant on affiche juste les voisins connus (autres civs)
  const neighbors = allCivs.filter(c => c.id !== civ.id && c.status === 'alive');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: civ.color }} />
          <span className="text-sm font-semibold text-white truncate">{civ.nom}</span>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
            {AGE_LABELS[civ.age_tech] || civ.age_tech}
          </span>
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
            {GOV_LABELS[civ.gouvernement] || civ.gouvernement}
          </span>
          {civ.status === 'effondree' && (
            <span className="text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded">Effondrée</span>
          )}
        </div>

        {/* Créateur + description */}
        {civ.creator_name && civ.creator_name !== 'Inconnu' && (
          <div className="text-xs text-gray-500">Fondée par <span className="text-gray-300">{civ.creator_name}</span></div>
        )}
        {civ.description && (
          <p className="text-xs text-gray-400 italic leading-relaxed">"{civ.description}"</p>
        )}

        {/* Valeurs */}
        {civ.valeurs?.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Valeurs</div>
            <div className="flex flex-wrap gap-1">
              {civ.valeurs.map(v => (
                <span key={v} className="text-xs bg-amber-900/30 text-amber-300 border border-amber-800/50 px-1.5 py-0.5 rounded">{v}</span>
              ))}
            </div>
          </div>
        )}

        {/* Stats population & moral */}
        <div className="space-y-2">
          <StatBar label="Population" value={civ.population || 0} max={Math.max(500, civ.population || 100)} color="bg-blue-500" />
          <StatBar label="Moral" value={civ.moral || 50} max={100} color="bg-purple-500" />
        </div>

        {/* Armée */}
        <div className="bg-gray-900 rounded p-2 text-xs flex items-center justify-between">
          <span className="text-gray-400">⚔️ Armée</span>
          <span className="text-white">
            {civ.army_soldiers || 0} soldats · équip: {EQUIPMENT_LABELS[civ.age_tech] || 'aucun'} · puissance: {civ.military_power || 0}
          </span>
        </div>

        {/* Ressources multi */}
        {civ.resources && Object.keys(civ.resources).length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Ressources</div>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(civ.resources)
                .filter(([, val]) => val > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([res, val]) => (
                  <div key={res} className="flex items-center justify-between bg-gray-900 rounded px-1.5 py-0.5">
                    <span className="text-xs text-gray-400">{RESOURCE_ICONS[res] || '📦'} {res}</span>
                    <span className="text-xs text-white font-mono">{Math.round(val)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {/* Territoire */}
        <div className="flex justify-between text-xs bg-gray-900 rounded p-2">
          <span className="text-gray-400">Territoire</span>
          <span className="text-white">{civ.territory_count || 0} cases</span>
        </div>

        {/* Structures */}
        {civ.buildings?.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Structures</div>
            <div className="flex flex-col gap-1">
              {civ.buildings.map((b, i) => {
                const name    = typeof b === 'string' ? b : b.name;
                const workers = typeof b === 'string' ? 0  : (b.workers || 0);
                const status  = typeof b === 'string' ? 'active' : (b.status || 'active');
                return (
                  <div key={i} className="flex items-center justify-between bg-gray-800 rounded px-1.5 py-0.5">
                    <span className="text-xs text-gray-300 truncate max-w-[140px]">{name}</span>
                    {workers > 0 && (
                      <span className="text-xs text-amber-400 shrink-0 ml-1">{workers} 👤</span>
                    )}
                    {status === 'task' && (
                      <span className="text-xs text-blue-400 shrink-0 ml-1">tâche</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Pensées récentes */}
        {recentThoughts.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Dernières décisions</div>
            <div className="space-y-1.5">
              {recentThoughts.map((t, i) => (
                <div key={i} className="bg-gray-900 rounded p-2 text-xs">
                  <div className="flex gap-1 flex-wrap mb-1">
                    {(t.actions || []).map((a, j) => (
                      <span key={j} className="bg-amber-900/40 text-amber-300 px-1 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                  {t.raison && <p className="text-gray-500 italic">"{t.raison}"</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Relations diplomatiques */}
        {neighbors.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Civilisations voisines</div>
            <div className="space-y-1">
              {neighbors.slice(0, 6).map(n => (
                <div key={n.id} className="flex items-center justify-between text-xs bg-gray-900 rounded px-2 py-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: n.color }} />
                    <span className="text-gray-300 truncate max-w-[100px]">{n.nom}</span>
                  </div>
                  <span className="text-gray-600">{AGE_LABELS[n.age_tech]?.split(' ')[0] || '?'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
