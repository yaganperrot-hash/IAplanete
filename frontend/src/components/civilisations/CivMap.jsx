import { useEffect, useRef, useMemo } from 'react';

const CELL_SIZE = 3;
const MAP_WIDTH = 256;
const MAP_HEIGHT = 192;

const CATEGORY_EMOJI = {
  agriculture: '🌾', militaire: '⚔️', commerce: '🏪', religieux: '🛕',
  extraction: '⛏️', production: '🔨', defense: '🏰', maritime: '⚓',
  savoir: '📚', bois: '🪓', chasse: '🏹', peche: '🎣',
  surveillance: '👁️', autre: '🏠',
};

const ANIMAL_EMOJI = {
  agressif: '🐺',
  peureux: '🦌',
  oiseau: '🦅',
};

const BIOME_COLORS = {
  prairie: '#4a7c3f', tropical_forest: '#2d6a2d', temperate_forest: '#3a6b3a',
  savanna: '#8b7355', desert_hot: '#c8a96e', desert_cold: '#9b9b7a',
  mountain: '#7a7a7a', hills: '#6b7a5a', tundra: '#a0b0b0', swamp: '#4a6b4a',
  volcano: '#8b2000', coast: '#5a9b9b', ocean: '#1a4a7a', ocean_deep: '#0a2a5a', reef: '#2a6b6b',
};

export default function CivMap({ biomes, civs, territories, onClickMap, spawnMode, spawnCoords, loading }) {
  const canvasRef = useRef(null);
  const offscreenRef = useRef(null);
  const drawRef = useRef(null);

  const civMap = useMemo(() => {
    const m = {};
    for (const c of civs) m[c.id] = c;
    return m;
  }, [civs]);

  const territoryMap = useMemo(() => {
    const m = {};
    for (const t of territories) m[`${t.x},${t.y}`] = t.civ_id;
    return m;
  }, [territories]);

  // Pré-rendu biomes dans un canvas offscreen (résolution fixe)
  useEffect(() => {
    if (!biomes.length) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = MAP_WIDTH * CELL_SIZE;
    offscreen.height = MAP_HEIGHT * CELL_SIZE;
    const ctx = offscreen.getContext('2d');
    for (const b of biomes) {
      ctx.fillStyle = BIOME_COLORS[b.biome_type] || '#333';
      ctx.fillRect(b.x * CELL_SIZE, b.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
    offscreenRef.current = offscreen;
    drawRef.current?.();
  }, [biomes]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Facteur d'échelle : canvas remplit le conteneur, on adapte les coordonnées
    const sx = canvas.width / (MAP_WIDTH * CELL_SIZE);
    const sy = canvas.height / (MAP_HEIGHT * CELL_SIZE);

    ctx.save();
    ctx.scale(sx, sy);

    // 1. Fond + biomes
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, MAP_WIDTH * CELL_SIZE, MAP_HEIGHT * CELL_SIZE);
    if (offscreenRef.current) {
      ctx.drawImage(offscreenRef.current, 0, 0);
    }

    // 2. Territoires (overlay semi-transparent)
    for (const [key, civId] of Object.entries(territoryMap)) {
      const civ = civMap[civId];
      if (!civ) continue;
      const [x, y] = key.split(',').map(Number);
      ctx.fillStyle = civ.color + '55';
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }

    // 3. Frontières entre territoires différents
    ctx.lineWidth = 0.5;
    for (const [key, civId] of Object.entries(territoryMap)) {
      const [x, y] = key.split(',').map(Number);
      for (const { dx, dy } of [{ dx: 1, dy: 0 }, { dx: 0, dy: 1 }]) {
        const neighborCivId = territoryMap[`${x + dx},${y + dy}`];
        if (neighborCivId && neighborCivId !== civId) {
          const civ = civMap[civId];
          ctx.strokeStyle = civ ? civ.color : '#fff';
          ctx.beginPath();
          if (dx === 1) {
            ctx.moveTo((x + 1) * CELL_SIZE, y * CELL_SIZE);
            ctx.lineTo((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE);
          } else {
            ctx.moveTo(x * CELL_SIZE, (y + 1) * CELL_SIZE);
            ctx.lineTo((x + 1) * CELL_SIZE, (y + 1) * CELL_SIZE);
          }
          ctx.stroke();
        }
      }
    }

    // 4. Capitales
    for (const civ of civs) {
      if (civ.status !== 'alive') continue;
      const px = civ.capital_x * CELL_SIZE + CELL_SIZE / 2;
      const py = civ.capital_y * CELL_SIZE + CELL_SIZE / 2;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = civ.color + 'aa';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }

    // 5. Structures (emoji sur leur case)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${CELL_SIZE * 3}px serif`;
    for (const civ of civs) {
      if (civ.status !== 'alive') continue;
      for (const b of (civ.buildings || [])) {
        if (b.x == null || b.y == null) continue;
        const px = b.x * CELL_SIZE + CELL_SIZE / 2;
        const py = b.y * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText(CATEGORY_EMOJI[b.category] || '🏠', px, py);
      }
    }

    // 6. Reliques
    ctx.font = `${CELL_SIZE * 2}px serif`;
    for (const civ of civs) {
      if (civ.status !== 'alive') continue;
      for (const r of (civ.relics || [])) {
        if (r.x == null || r.y == null) continue;
        const px = r.x * CELL_SIZE + CELL_SIZE / 2;
        const py = r.y * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText('🏺', px, py);
      }
    }

    // 7. Groupes animaux
    ctx.font = `${CELL_SIZE * 2}px serif`;
    for (const civ of civs) {
      if (civ.status !== 'alive') continue;
      for (const ag of (civ.animal_groups || [])) {
        if (ag.x == null || ag.y == null) continue;
        const px = ag.x * CELL_SIZE + CELL_SIZE / 2;
        const py = ag.y * CELL_SIZE + CELL_SIZE / 2;
        ctx.fillText(ANIMAL_EMOJI[ag.type] || '❓', px, py);
      }
    }

    // 8. Aperçu spawn
    if (spawnMode && spawnCoords) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        (spawnCoords.x - 4) * CELL_SIZE, (spawnCoords.y - 4) * CELL_SIZE,
        9 * CELL_SIZE, 9 * CELL_SIZE
      );
    }

    ctx.restore();
  }

  // Garder drawRef à jour à chaque render (pour ResizeObserver)
  useEffect(() => { drawRef.current = draw; });

  // ResizeObserver — identique à WorldMap
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
        canvas.width = MAP_WIDTH * CELL_SIZE;
        canvas.height = MAP_HEIGHT * CELL_SIZE;
      }
      drawRef.current?.();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, []);

  // Redessiner à chaque changement de données
  useEffect(() => { drawRef.current?.(); }, [territoryMap, civMap, spawnCoords, spawnMode]);

  function handleClick(e) {
    const canvas = canvasRef.current;
    if (!canvas || !onClickMap) return;
    const rect = canvas.getBoundingClientRect();
    // Convertir pixel écran → cellule carte
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const sx = canvas.width / (MAP_WIDTH * CELL_SIZE);
    const sy = canvas.height / (MAP_HEIGHT * CELL_SIZE);
    const x = Math.floor(cx / (CELL_SIZE * sx));
    const y = Math.floor(cy / (CELL_SIZE * sy));
    if (x >= 0 && x < MAP_WIDTH && y >= 0 && y < MAP_HEIGHT) {
      onClickMap(x, y, territoryMap[`${x},${y}`]);
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-950">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated', cursor: spawnMode ? 'crosshair' : 'default' }}
        onClick={handleClick}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-3xl mb-2">🗺️</div>
            <div className="text-sm">Connexion au serveur...</div>
          </div>
        </div>
      )}
      {!loading && biomes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500">
          <div className="text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <div className="text-sm">Aucune donnée carte reçue</div>
            <div className="text-xs mt-1 text-gray-600">Vérifiez la console serveur</div>
          </div>
        </div>
      )}
    </div>
  );
}
