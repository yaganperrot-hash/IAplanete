import { useState } from 'react';
import { useSocket } from './hooks/useSocket.js';
import WorldMap from './components/WorldMap.jsx';
import EventFeed from './components/EventFeed.jsx';
import Dashboard from './components/Dashboard.jsx';
import SpeciesForm from './components/SpeciesForm.jsx';
import SpeciesCard from './components/SpeciesCard.jsx';
import RankingPanel from './components/RankingPanel.jsx';
import CivMode from './components/civilisations/CivMode.jsx';

function ModeSelector({ onSelect }) {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-950 text-gray-100 gap-8">
      <div className="text-center mb-4">
        <h1 className="text-4xl font-bold text-white mb-2">WorldIA</h1>
        <p className="text-gray-400">Choisissez votre simulation</p>
      </div>
      <div className="flex gap-6">
        <button onClick={() => onSelect('planet')}
          className="group flex flex-col items-center gap-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-blue-500 rounded-xl p-8 w-64 transition-all">
          <span className="text-5xl">🌍</span>
          <div className="text-center">
            <div className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">AI Planet</div>
            <div className="text-sm text-gray-400 mt-2">Écosystème de créatures autonomes pilotées par IA. Évolution, prédation, reproduction.</div>
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {['Créatures', 'Espèces', 'Écosystème'].map(t => (
              <span key={t} className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        </button>

        <button onClick={() => onSelect('civilisations')}
          className="group flex flex-col items-center gap-4 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-amber-500 rounded-xl p-8 w-64 transition-all">
          <span className="text-5xl">🏛️</span>
          <div className="text-center">
            <div className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">WorldIA Civilisations</div>
            <div className="text-sm text-gray-400 mt-2">Sociétés humaines gérées par des agents IA. Diplomatie, guerre, technologie, commerce.</div>
          </div>
          <div className="flex flex-wrap gap-1 justify-center">
            {['Civilisations', 'Diplomatie', 'Technologie'].map(t => (
              <span key={t} className="text-xs bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        </button>
      </div>
    </div>
  );
}

function PlanetMode() {
  const {
    connected, worldData, creatures, cadavres, species, events,
    tickInfo, stats, popHistory, speciesStats, requestSpeciesRefresh,
  } = useSocket();
  const [selectedSpecies, setSelectedSpecies] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [rightPanel, setRightPanel] = useState('events');
  const [spawnCoords, setSpawnCoords] = useState(null);

  function handleSelectSpecies(sp) { setSelectedSpecies(sp); setRightPanel('species-card'); setShowForm(false); }
  function handleOpenForm() { setShowForm(true); setRightPanel('form'); setSelectedSpecies(null); setSpawnCoords(null); }
  function handleCreated(sp) { requestSpeciesRefresh(); setSelectedSpecies(sp); setRightPanel('species-card'); setShowForm(false); }

  const aliveSpecies = species.filter(s => s.status === 'alive');
  const extinctSpecies = species.filter(s => s.status === 'extinct');
  const enrichedSelected = selectedSpecies ? { ...selectedSpecies, ...speciesStats.find(s => s.id === selectedSpecies.id) } : null;

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 select-none">
      <Dashboard stats={stats} tickInfo={tickInfo} connected={connected} />

      <div className="flex flex-1 overflow-hidden">
        <div className="w-52 shrink-0 border-r border-gray-800 flex flex-col bg-gray-950">
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase">Espèces</span>
            <button onClick={handleOpenForm}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-2 py-0.5 rounded transition-colors">
              + Nouvelle
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {aliveSpecies.map(sp => {
              const spCreatures = creatures.filter(c => c.species_id === sp.id);
              const isSelected = selectedSpecies?.id === sp.id;
              return (
                <button key={sp.id} onClick={() => handleSelectSpecies(sp)}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-800 transition-colors border-l-2 ${isSelected ? 'bg-gray-800 border-blue-500' : 'border-transparent'}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sp.color }} />
                    <span className="text-xs text-white font-medium truncate flex-1">{sp.nom}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 pl-4">
                    {spCreatures.length} individus · {sp.params?.regime || '?'}
                  </div>
                </button>
              );
            })}

            {extinctSpecies.length > 0 && (
              <>
                <div className="px-3 py-1 mt-2 text-xs text-gray-600 uppercase">Éteintes</div>
                {extinctSpecies.map(sp => (
                  <button key={sp.id} onClick={() => handleSelectSpecies(sp)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-900 transition-colors opacity-50">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">☠</span>
                      <span className="text-xs text-gray-500 truncate">{sp.nom}</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {species.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-gray-600">
                <div className="text-2xl mb-2">🌱</div>
                <div>Aucune espèce.</div><div>Créez la première !</div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-800 px-3 py-2 text-xs text-gray-600 space-y-0.5">
            <div>{creatures.filter(c => c.status === 'alive').length} créatures vivantes</div>
            <div>{cadavres?.length || 0} cadavres</div>
            <div>{aliveSpecies.length} espèces actives</div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <WorldMap
            creatures={creatures} cadavres={cadavres} species={species} events={events}
            tickInfo={tickInfo} onSelectSpecies={handleSelectSpecies}
            spawnMode={rightPanel === 'form'} onSpawnSelect={(x, y) => setSpawnCoords({ x, y })}
            spawnCoords={spawnCoords}
          />
        </div>

        <div className="w-72 shrink-0 border-l border-gray-800 flex flex-col bg-gray-950">
          {rightPanel !== 'form' && rightPanel !== 'species-card' && (
            <div className="flex border-b border-gray-800 shrink-0">
              <button onClick={() => setRightPanel('events')}
                className={`flex-1 text-xs py-2 transition-colors ${rightPanel === 'events' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                Événements
              </button>
              <button onClick={() => setRightPanel('ranking')}
                className={`flex-1 text-xs py-2 transition-colors ${rightPanel === 'ranking' ? 'text-white border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'}`}>
                Classement
              </button>
            </div>
          )}
          {rightPanel === 'form' ? (
            <SpeciesForm onCreated={handleCreated} onClose={() => setRightPanel('events')} spawnCoords={spawnCoords} />
          ) : rightPanel === 'species-card' && selectedSpecies ? (
            <SpeciesCard species={enrichedSelected || selectedSpecies} creatures={creatures} allSpecies={species}
              onClose={() => { setRightPanel('events'); setSelectedSpecies(null); }} />
          ) : rightPanel === 'ranking' ? (
            <RankingPanel species={species} speciesStats={speciesStats} popHistory={popHistory} onSelectSpecies={handleSelectSpecies} />
          ) : (
            <EventFeed events={events} species={species} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState(null); // null | 'planet' | 'civilisations'

  if (!mode) return <ModeSelector onSelect={setMode} />;
  if (mode === 'civilisations') return <CivMode onBack={() => setMode(null)} />;
  return <PlanetMode />;
}
