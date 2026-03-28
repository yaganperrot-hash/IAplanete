import { useState } from 'react';
import { useCivSocket } from '../../hooks/useCivSocket.js';
import CivMap from './CivMap.jsx';
import CivForm from './CivForm.jsx';
import CivCard from './CivCard.jsx';
import LeaderJournal from './LeaderJournal.jsx';

const AGE_LABELS = {
  primitif:   '🪨',
  neolithique:'🌾',
  bronze:     '🥉',
  fer:        '⚔️',
  classique:  '🏛️',
};

export default function CivMode({ onBack }) {
  const { connected, worldData, biomes, civs, territories, events, thoughtLogs, tick, year, season, monthName, dayOfYear, refreshCivs } = useCivSocket();

  const [selectedCiv, setSelectedCiv] = useState(null);
  const [rightPanel, setRightPanel] = useState('journal'); // 'journal' | 'form' | 'civ-card'
  const [spawnMode, setSpawnMode] = useState(false);
  const [spawnCoords, setSpawnCoords] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const aliveCivs = civs.filter(c => c.status === 'alive');
  const deadCivs = civs.filter(c => c.status === 'effondree');

  function handleOpenForm() {
    setRightPanel('form');
    setSpawnMode(true);
    setSelectedCiv(null);
    setSpawnCoords(null);
  }

  function handleCloseForm() {
    setRightPanel('journal');
    setSpawnMode(false);
    setSpawnCoords(null);
  }

  function handleCreated(civ) {
    refreshCivs();
    setSelectedCiv(civ);
    setRightPanel('civ-card');
    setSpawnMode(false);
    setSpawnCoords(null);
  }

  function handleSelectCiv(civ) {
    setSelectedCiv(civ);
    setRightPanel('civ-card');
    setSpawnMode(false);
  }

  async function handleReset() {
    setResetting(true);
    setConfirmReset(false);
    try {
      await fetch('http://localhost:4000/api/civs/reset', { method: 'POST' });
      setSelectedCiv(null);
      setRightPanel('journal');
      setSpawnMode(false);
      setSpawnCoords(null);
      refreshCivs();
    } finally {
      setResetting(false);
    }
  }

  function handleClickMap(x, y, civId) {
    if (spawnMode) {
      setSpawnCoords({ x, y });
    } else if (civId) {
      const civ = civs.find(c => c.id === civId);
      if (civ) handleSelectCiv(civ);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 shrink-0 bg-gray-950">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-gray-500 hover:text-white text-sm transition-colors">← Retour</button>
          <span className="text-amber-400 font-semibold">🏛️ WorldIA Civilisations</span>
          {worldData && (
            <span className="text-xs text-gray-500">
              {monthName || 'Juin'}, An {year} · {season}
              <span className="ml-1 text-gray-600">(t{tick})</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded ${connected ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
            {connected ? '● En ligne' : '● Déconnecté'}
          </span>
          <span className="text-xs text-gray-500">{aliveCivs.length} civilisations</span>
          <button
            onClick={() => setConfirmReset(true)}
            disabled={resetting}
            className="text-xs px-2 py-0.5 rounded bg-red-900/40 text-red-400 hover:bg-red-700/50 hover:text-red-300 transition-colors disabled:opacity-50">
            {resetting ? '...' : '↺ Reset'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Panneau gauche — liste des civs */}
        <div className="w-52 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Civilisations</span>
            <button onClick={handleOpenForm}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs px-2 py-0.5 rounded transition-colors">
              + Créer
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {aliveCivs.map(civ => {
              const isSelected = selectedCiv?.id === civ.id;
              return (
                <button key={civ.id} onClick={() => handleSelectCiv(civ)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors border-l-2 ${isSelected ? 'bg-gray-800 border-amber-500' : 'border-transparent'}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: civ.color }} />
                    <span className="text-xs text-white font-medium truncate flex-1">{civ.nom}</span>
                    <span className="text-xs text-gray-500">{civ.gouvernement || ''}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 pl-4">
                    Pop {civ.population || 0} · {civ.territory_count || 0} cases
                  </div>
                </button>
              );
            })}

            {deadCivs.length > 0 && (
              <>
                <div className="px-3 py-1 mt-2 text-xs text-gray-600 uppercase">Effondrées</div>
                {deadCivs.map(civ => (
                  <button key={civ.id} onClick={() => handleSelectCiv(civ)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-900 transition-colors opacity-50">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">☠</span>
                      <span className="text-xs text-gray-500 truncate">{civ.nom}</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {civs.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-gray-600">
                <div className="text-2xl mb-2">🏛️</div>
                <div>Aucune civilisation.</div>
                <div>Cliquez sur "+ Créer" !</div>
              </div>
            )}
          </div>

          {/* Stats bas */}
          <div className="border-t border-gray-800 px-3 py-2 text-xs text-gray-600 space-y-0.5">
            <div>{aliveCivs.length} civ. actives</div>
            <div>{aliveCivs.reduce((s, c) => s + (c.population || 0), 0)} habitants</div>
            <div>{aliveCivs.reduce((s, c) => s + (c.territory_count || 0), 0)} cases</div>
          </div>
        </div>

        {/* Carte centrale — identique à PlanetMode */}
        <div className="flex-1 overflow-hidden">
          <CivMap
            biomes={biomes}
            civs={civs}
            territories={territories}
            onClickMap={handleClickMap}
            spawnMode={spawnMode}
            spawnCoords={spawnCoords}
            loading={!connected && biomes.length === 0}
          />
        </div>

        {/* Panneau droit */}
        <div className="w-72 shrink-0 border-l border-gray-800 flex flex-col bg-gray-950">
          {rightPanel === 'form' ? (
            <CivForm
              onCreated={handleCreated}
              onClose={handleCloseForm}
              spawnCoords={spawnCoords}
            />
          ) : rightPanel === 'civ-card' && selectedCiv ? (
            <CivCard
              civ={selectedCiv}
              allCivs={civs}
              thoughtLogs={thoughtLogs}
              onClose={() => { setRightPanel('journal'); setSelectedCiv(null); }}
            />
          ) : (
            <>
              <div className="flex border-b border-gray-800 shrink-0">
                <button onClick={() => setRightPanel('journal')}
                  className={`flex-1 text-xs py-2 transition-colors ${rightPanel === 'journal' ? 'text-white border-b-2 border-amber-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  Journal
                </button>
                <button onClick={() => setRightPanel('events')}
                  className={`flex-1 text-xs py-2 transition-colors ${rightPanel === 'events' ? 'text-white border-b-2 border-amber-500' : 'text-gray-500 hover:text-gray-300'}`}>
                  Événements
                </button>
              </div>
              {rightPanel === 'events' ? (
                <EventsList events={events} civs={civs} />
              ) : (
                <LeaderJournal civ={null} thoughtLogs={thoughtLogs} events={events} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Modale de confirmation reset */}
      {confirmReset && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-800 rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-white font-semibold mb-2">Réinitialiser le monde ?</h3>
            <p className="text-gray-400 text-sm mb-5">
              Toutes les civilisations, territoires et événements seront supprimés. Le tick revient à 0.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmReset(false)}
                className="text-sm px-4 py-1.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors">
                Annuler
              </button>
              <button
                onClick={handleReset}
                className="text-sm px-4 py-1.5 rounded bg-red-700 text-white hover:bg-red-600 transition-colors">
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EventsList({ events, civs }) {
  const civMap = {};
  for (const c of civs) civMap[c.id] = c;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-2">
      {events.length === 0 && (
        <div className="text-center text-xs text-gray-600 py-8">Aucun événement</div>
      )}
      {events.map((ev, i) => {
        let civIds = [];
        try { civIds = JSON.parse(ev.civ_ids || ev.species_ids || '[]'); } catch {}
        return (
          <div key={ev.id || i} className="py-1.5 border-b border-gray-900 last:border-0">
            <div className="flex gap-2">
              <span className="text-xs text-gray-600 shrink-0 mt-0.5">T{ev.tick}</span>
              <div className="flex-1">
                {civIds.length > 0 && (
                  <div className="flex gap-1 mb-0.5 flex-wrap">
                    {civIds.map(id => civMap[id] && (
                      <span key={id} className="text-xs font-medium" style={{ color: civMap[id].color }}>
                        {civMap[id].nom}
                      </span>
                    ))}
                  </div>
                )}
                <p className={`text-xs leading-relaxed ${
                  ev.type === 'guerre' ? 'text-red-400' :
                  ev.type === 'alliance' ? 'text-green-400' :
                  ev.type === 'naissance' ? 'text-amber-400' :
                  ev.type === 'effondrement' ? 'text-red-500' :
                  ev.type === 'revolte' ? 'text-orange-400' :
                  'text-gray-400'
                }`}>{ev.description}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
