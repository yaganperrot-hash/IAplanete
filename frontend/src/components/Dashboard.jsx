import { useState } from 'react';
import { resetWorld } from '../api/index.js';

export default function Dashboard({ stats, tickInfo, connected }) {
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!window.confirm('Réinitialiser le monde ? Toutes les espèces et créatures seront supprimées.')) return;
    setResetting(true);
    try {
      await resetWorld();
      window.location.reload();
    } catch {
      alert('Erreur lors de la réinitialisation');
      setResetting(false);
    }
  }
  const SEASON_COLOR = {
    printemps: 'text-green-400',
    été: 'text-yellow-400',
    automne: 'text-orange-400',
    hiver: 'text-blue-300',
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800 shrink-0 overflow-x-auto">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-lg">🌍</span>
        <span className="font-bold text-white tracking-wide text-sm">AI PLANET</span>
      </div>

      <div className="w-px h-6 bg-gray-700" />

      {/* Statut connexion */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-500'}`} />
        <span className="text-xs text-gray-400">{connected ? 'En direct' : 'Déconnecté'}</span>
      </div>

      {tickInfo && (
        <>
          <div className="w-px h-6 bg-gray-700" />
          <div className="flex items-center gap-4 text-xs shrink-0">
            <span className="text-gray-400">
              Tick <span className="text-white font-mono">{tickInfo.tick}</span>
            </span>
            <span className="text-gray-400">
              Jour <span className="text-white">{tickInfo.day}</span>
            </span>
            <span className={SEASON_COLOR[tickInfo.season] || 'text-gray-300'}>
              {tickInfo.season?.charAt(0).toUpperCase() + tickInfo.season?.slice(1)}
            </span>
            <span className="text-gray-400">
              An <span className="text-white">{tickInfo.year}</span>
            </span>
          </div>
        </>
      )}

      {stats && (
        <>
          <div className="w-px h-6 bg-gray-700" />
          <div className="flex items-center gap-4 text-xs shrink-0">
            <div className="flex items-center gap-1">
              <span className="text-green-400">●</span>
              <span className="text-gray-300"><span className="text-white font-semibold">{stats.alive_creatures}</span> créatures</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-blue-400">◆</span>
              <span className="text-gray-300"><span className="text-white font-semibold">{stats.alive_species}</span> espèces actives</span>
            </div>
            {parseInt(stats.extinct_species) > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-gray-600">☠</span>
                <span className="text-gray-500"><span className="text-gray-400">{stats.extinct_species}</span> éteintes</span>
              </div>
            )}
          </div>
        </>
      )}
      <div className="ml-auto shrink-0">
        <button
          onClick={handleReset}
          disabled={resetting}
          className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-500 hover:border-red-700 hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          {resetting ? 'Reset...' : '↺ Reset monde'}
        </button>
      </div>
    </div>
  );
}
