import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchBiomes } from '../api/index.js';

const CELL_SIZE = 3;
const MAP_WIDTH = 256;
const MAP_HEIGHT = 192;

const BIOME_COLORS = {
  tropical_forest: '#1a6e3c',
  temperate_forest: '#2d7a4e',
  savanna: '#b8963e',
  desert_hot: '#d4a843',
  desert_cold: '#8ab4c8',
  mountain: '#7a7a7a',
  hills: '#6b8f52',
  volcano: '#8b0000',
  swamp: '#3d5c3e',
  coast: '#c8a84b',
  reef: '#2090b8',
  ocean_deep: '#0d2e5e',
  prairie: '#7cb854',
  tundra: '#b8ccd4',
  ocean: '#133a6e',
};

const EVENT_COLORS = {
  combat: '#ef4444',
  extinction: '#7c3aed',
  naissance: '#22c55e',
  milestone: '#f59e0b',
  catastrophe: '#f97316',
  speciation: '#06b6d4',
};

export default function WorldMap({ creatures, cadavres, species, events, tickInfo, onSelectSpecies, spawnMode, onSpawnSelect, spawnCoords }) {
  const canvasRef = useRef(null);
  const [biomes, setBiomes] = useState([]);
  const [biomesMap, setBiomesMap] = useState({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState(null);
  const [flashEvents, setFlashEvents] = useState([]);
  const speciesMap = useRef({});
  const lastEventsRef = useRef([]);
  const drawRef = useRef(null);
  useEffect(() => {
    fetchBiomes().then(data => {
      if (data?.biomes) {
        setBiomes(data.biomes);
        const map = {};
        for (const b of data.biomes) map[`${b.x},${b.y}`] = b;
        setBiomesMap(map);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const map = {};
    for (const sp of (species || [])) map[sp.id] = sp;
    speciesMap.current = map;
  }, [species]);

  useEffect(() => {
    if (!events || events.length === 0) return;
    const newEvents = events.filter(e => !lastEventsRef.current.find(le => le.id === e.id));
    if (newEvents.length > 0) {
      setFlashEvents(newEvents.filter(e => e.x != null));
      setTimeout(() => setFlashEvents([]), 3000);
    }
    lastEventsRef.current = events;
  }, [events]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    if (w === 0 || h === 0) return;

    const weather = tickInfo?.weather || {};
    const season = weather.season || 'printemps';
    const cs = CELL_SIZE;

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    // Fond noir si biomes pas encore chargés
    if (biomes.length === 0) {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#4b5563';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Chargement de la carte...', w / 2, h / 2);
      ctx.restore();
      return;
    }

    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Biomes
    for (const b of biomes) {
      ctx.fillStyle = BIOME_COLORS[b.biome_type] || '#1a1a2e';
      ctx.fillRect(b.x * cs, b.y * cs, cs, cs);
      if (b.food_level > 60) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(b.x * cs, b.y * cs, cs, cs);
      }
    }

    // Cadavres
    for (const c of (cadavres || [])) {
      const cx = c.x * cs + cs / 2;
      const cy = c.y * cs + cs / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,160,160,0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,180,180,0.4)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy); ctx.lineTo(cx + 2, cy);
      ctx.moveTo(cx, cy - 2); ctx.lineTo(cx, cy + 2);
      ctx.stroke();
    }

    // Créatures vivantes
    for (const c of (creatures || [])) {
      if (c.status !== 'alive') continue;
      const sp = speciesMap.current[c.species_id];
      if (!sp) continue;

      const taille = sp.params?.taille || 5;
      const radius = Math.max(2, Math.min(5, taille * 0.5));
      const cx = c.x * cs + cs / 2;
      const cy = c.y * cs + cs / 2;

      ctx.beginPath();
      ctx.arc(cx, cy, radius + 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = sp.color || '#fff';
      ctx.fill();

      if (c.energy < 30) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    // Flash d'événements
    for (const ev of flashEvents) {
      if (ev.x == null) continue;
      const color = EVENT_COLORS[ev.type] || '#fff';
      const cx = ev.x * cs + cs / 2;
      const cy = ev.y * cs + cs / 2;

      if (ev.type === 'catastrophe') {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 40, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 12, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Overlay nuit
    if (weather.isNight) {
      ctx.fillStyle = 'rgba(0, 0, 30, 0.35)';
      ctx.fillRect(0, 0, MAP_WIDTH * cs, MAP_HEIGHT * cs);
    }

    // Overlay pluie
    const avgPrecip = weather.avgPrecip || 0;
    const isRaining = avgPrecip > 60 && (season === 'printemps' || season === 'automne');
    if (isRaining) {
      ctx.fillStyle = `rgba(100, 150, 255, ${(avgPrecip - 60) / 400})`;
      ctx.fillRect(0, 0, MAP_WIDTH * cs, MAP_HEIGHT * cs);
    }

    // Overlay neige
    if (season === 'hiver' && avgPrecip > 40) {
      ctx.fillStyle = `rgba(220, 235, 255, ${(avgPrecip - 40) / 500})`;
      ctx.fillRect(0, 0, MAP_WIDTH * cs, MAP_HEIGHT * cs);
    }

    // Marqueur de spawn
    if (spawnCoords) {
      const cx = spawnCoords.x * cs + cs / 2;
      const cy = spawnCoords.y * cs + cs / 2;
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy); ctx.lineTo(cx + 7, cy);
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx, cy + 7);
      ctx.stroke();
    }

    ctx.restore();
  }, [biomes, creatures, cadavres, flashEvents, tickInfo, pan, zoom, spawnCoords]);

  // Garder drawRef à jour pour que ResizeObserver puisse l'appeler
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  // Canvas sizing — redessine après resize pour éviter l'effacement
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      } else {
        canvas.width = 768;
        canvas.height = 576;
      }
      drawRef.current?.();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize(); // Taille initiale

    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;
    const cellX = Math.floor(mx / CELL_SIZE);
    const cellY = Math.floor(my / CELL_SIZE);

    const biome = biomesMap[`${cellX},${cellY}`];
    const creaturesHere = (creatures || []).filter(c => c.x === cellX && c.y === cellY && c.status === 'alive');
    const cadavresHere = (cadavres || []).filter(c => c.x === cellX && c.y === cellY);

    if (biome || creaturesHere.length > 0) {
      setTooltip({
        x: e.clientX - rect.left, y: e.clientY - rect.top,
        biome: biome?.biome_type, food: biome?.food_level,
        water: biome?.water_level, precip: biome?.precipitation,
        creatures: creaturesHere, cadavresCount: cadavresHere.length,
        cellX, cellY,
      });
    } else {
      setTooltip(null);
    }
  }, [isPanning, panStart, pan, zoom, biomesMap, creatures, cadavres]);

  const handleMouseDown = useCallback((e) => {
    if (e.button === 2) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;
    const cellX = Math.floor(mx / CELL_SIZE);
    const cellY = Math.floor(my / CELL_SIZE);

    if (spawnMode) {
      if (onSpawnSelect) onSpawnSelect(cellX, cellY);
      return;
    }

    const creaturesHere = (creatures || []).filter(c => c.x === cellX && c.y === cellY && c.status === 'alive');
    if (creaturesHere.length > 0) {
      const sp = speciesMap.current[creaturesHere[0].species_id];
      if (sp && onSelectSpecies) onSelectSpecies(sp);
    }
  }, [pan, zoom, creatures, onSelectSpecies, spawnMode, onSpawnSelect]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(z => Math.max(0.5, Math.min(4, z * factor)));
  }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const SEASON_ICONS = { printemps: '🌸', été: '☀️', automne: '🍂', hiver: '❄️' };
  const weather = tickInfo?.weather || {};

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-950">
      {tickInfo && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-2 text-xs">
          <span className="bg-black/60 px-2 py-1 rounded text-gray-300">
            Tick {tickInfo.tick} · Jour {tickInfo.day} · {tickInfo.season} {SEASON_ICONS[tickInfo.season] || ''} · An {tickInfo.year}
          </span>
          {weather.isNight && <span className="bg-indigo-900/80 px-2 py-1 rounded text-indigo-300">🌙 Nuit</span>}
          {weather.avgPrecip > 60 && (weather.season === 'printemps' || weather.season === 'automne') && (
            <span className="bg-blue-900/80 px-2 py-1 rounded text-blue-300">🌧 Pluie</span>
          )}
          {weather.season === 'hiver' && weather.avgPrecip > 40 && (
            <span className="bg-slate-700/80 px-2 py-1 rounded text-slate-300">❄️ Neige</span>
          )}
        </div>
      )}

      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={() => setZoom(z => Math.min(4, z * 1.2))} className="bg-black/60 hover:bg-gray-700 w-8 h-8 rounded text-white font-bold text-lg flex items-center justify-center">+</button>
        <button onClick={() => setZoom(z => Math.max(0.5, z * 0.8))} className="bg-black/60 hover:bg-gray-700 w-8 h-8 rounded text-white font-bold text-lg flex items-center justify-center">−</button>
        <button onClick={resetView} className="bg-black/60 hover:bg-gray-700 w-8 h-8 rounded text-gray-300 text-xs flex items-center justify-center">⌂</button>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ cursor: isPanning ? 'grabbing' : 'crosshair', imageRendering: 'pixelated' }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
      />

      {tooltip && (
        <div
          className="absolute z-20 bg-gray-900/95 border border-gray-700 rounded px-3 py-2 text-xs pointer-events-none max-w-48"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="text-gray-400 capitalize mb-1">
            {tooltip.biome?.replace(/_/g, ' ')} ({tooltip.cellX},{tooltip.cellY})
          </div>
          <div className="flex gap-3 text-gray-300">
            <span>🌿 {tooltip.food}%</span>
            <span>💧 {tooltip.water}%</span>
          </div>
          {tooltip.cadavresCount > 0 && (
            <div className="text-gray-500 mt-0.5">💀 {tooltip.cadavresCount} cadavre(s)</div>
          )}
          {tooltip.creatures.length > 0 && (
            <div className="mt-1 border-t border-gray-700 pt-1">
              {tooltip.creatures.slice(0, 3).map(c => {
                const sp = speciesMap.current[c.species_id];
                return (
                  <div key={c.id} className="flex items-center gap-1">
                    <span style={{ color: sp?.color || '#fff' }}>●</span>
                    <span>{sp?.nom || '?'}</span>
                    <span className="text-gray-500">⚡{c.energy}%</span>
                  </div>
                );
              })}
              {tooltip.creatures.length > 3 && <div className="text-gray-500">+{tooltip.creatures.length - 3} autres</div>}
            </div>
          )}
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-10 bg-black/70 rounded p-2 text-xs grid grid-cols-3 gap-x-3 gap-y-0.5 max-w-xs">
        {Object.entries(BIOME_COLORS).slice(0, 9).map(([biome, color]) => (
          <div key={biome} className="flex items-center gap-1 text-gray-400">
            <span style={{ width: 8, height: 8, background: color, display: 'inline-block', borderRadius: 1 }} />
            <span className="truncate">{biome.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
