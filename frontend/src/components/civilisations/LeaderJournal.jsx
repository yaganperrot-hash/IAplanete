const GOV_LABELS = {
  monarchie: 'Monarchie',
  democratie: 'Démocratie',
  theocratie: 'Théocratie',
  conseil_anciens: 'Conseil des anciens',
  dictature_militaire: 'Dictature militaire',
  anarchie_cooperative: 'Anarchie coopérative',
};

const ACTION_LABELS = {
  // Nouveau format libre
  AFFECTER:   '👥 Affecter',
  CRÉER:      '🏗️ Créer',
  CREER:      '🏗️ Créer',
  ENVOYER:    '🚶 Envoyer',
  MODIFIER:   '✏️ Modifier',
  ABANDONNER: '🗑️ Abandonner',
  DIPLOMATIE: '🤝 Diplomatie',
  RIEN:       '⏳ Rien',
  // Ancien format (rétrocompat)
  EXPLORER: '🧭 Explorer', CONSTRUIRE: '🏗️ Construire',
  DEVELOPPER_AGRICULTURE: '🌾 Agriculture', RECRUTER_ARMEE: '⚔️ Recruter',
  ATTAQUER: '🗡️ Attaquer', DEFENDRE: '🛡️ Défendre',
  PROPOSER_ALLIANCE: '🤝 Alliance', PROPOSER_COMMERCE: '💰 Commerce',
  FONDER_COLONIE: '🏙️ Colonie', PILLER: '💀 Piller',
  SE_VASSALISER: '⛓️ Vassaliser', RATIONNER: '🍞 Rationner',
  CELEBRER: '🎉 Célébrer',
};

export default function LeaderJournal({ civ, thoughtLogs, events }) {
  // Filtrer les logs pour cette civ spécifique (si civ sélectionnée) ou tous
  const logs = civ
    ? thoughtLogs.filter(t => t.civ_id === civ.id).slice(0, 12)
    : thoughtLogs.slice(0, 20);

  const civEvents = civ
    ? events.filter(e => {
        try {
          const ids = JSON.parse(e.civ_ids || e.species_ids || '[]');
          return ids.includes(civ.id);
        } catch { return false; }
      }).slice(0, 10)
    : events.slice(0, 15);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <span className="text-xs font-semibold text-amber-400 uppercase">
          {civ ? `Journal — ${civ.nom}` : 'Journal des dirigeants'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pensées récentes */}
        {logs.length > 0 && (
          <div className="px-3 py-2">
            <div className="text-xs text-gray-600 uppercase mb-2">Décisions récentes</div>
            <div className="space-y-2">
              {logs.map((log, i) => (
                <div key={log.id || i} className="bg-gray-900 rounded p-2 border border-gray-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">
                      {civ ? '' : <span className="text-amber-400 mr-1">{log.civ_nom || `Civ #${log.civ_id}`}</span>}
                      tick {log.tick}
                    </span>
                    <div className="flex gap-1 flex-wrap justify-end">
                      {(log.actions || []).map((a, j) => (
                        <span key={j} className="text-xs bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded">
                          {ACTION_LABELS[a] || a}
                        </span>
                      ))}
                    </div>
                  </div>
                  {log.raison && (
                    <p className="text-xs text-gray-400 italic leading-relaxed">"{log.raison}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Événements */}
        {civEvents.length > 0 && (
          <div className="px-3 py-2 border-t border-gray-800">
            <div className="text-xs text-gray-600 uppercase mb-2">Événements</div>
            <div className="space-y-1">
              {civEvents.map((ev, i) => (
                <div key={ev.id || i} className="flex gap-2 text-xs py-1">
                  <span className="text-gray-600 shrink-0">T{ev.tick}</span>
                  <span className={`flex-1 ${
                    ev.type === 'guerre' ? 'text-red-400' :
                    ev.type === 'alliance' ? 'text-green-400' :
                    ev.type === 'naissance' ? 'text-amber-400' :
                    ev.type === 'effondrement' ? 'text-red-500' :
                    'text-gray-400'
                  }`}>{ev.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {logs.length === 0 && civEvents.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-gray-600">
            <div className="text-2xl mb-2">📜</div>
            <div>Aucune entrée dans le journal.</div>
          </div>
        )}
      </div>
    </div>
  );
}
