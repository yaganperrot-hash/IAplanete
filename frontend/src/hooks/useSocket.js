import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = 'http://localhost:4000';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [worldData, setWorldData] = useState(null);
  const [creatures, setCreatures] = useState([]);
  const [cadavres, setCadavres] = useState([]);
  const [species, setSpecies] = useState([]);
  const [events, setEvents] = useState([]);
  const [tickInfo, setTickInfo] = useState(null);
  const [stats, setStats] = useState(null);
  const [popHistory, setPopHistory] = useState([]); // [{ species_id, tick, population }]
  const [speciesStats, setSpeciesStats] = useState([]); // [{ id, total_kills, ticks_alive, population }]

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('WebSocket connecté');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('WebSocket déconnecté');
    });

    socket.on('world:init', (data) => {
      if (data.error) { console.error('world:init error:', data.error); return; }
      setWorldData(data.world);
      setStats(data.stats);
      setCreatures(data.creatures || []);
      setCadavres(data.cadavres || []);
      setSpecies(data.species || []);
      setEvents(data.events || []);
      setPopHistory(data.pop_history || []);
      setSpeciesStats(data.species_stats || []);
      setTickInfo({
        tick: data.world?.tick,
        day: data.world?.day,
        season: data.world?.season,
        year: data.world?.year,
        weather: data.world?.weather_state,
      });
    });

    socket.on('tick:update', (data) => {
      setTickInfo({
        tick: data.world?.tick,
        day: data.world?.day,
        season: data.world?.season,
        year: data.world?.year,
        weather: data.world?.weather_state,
      });
      setCreatures(data.creatures || []);
      setCadavres(data.cadavres || []);

      if (data.recent_events) setEvents(data.recent_events);
      if (data.pop_history) setPopHistory(prev => {
        // Fusionner les nouvelles entrées en gardant les 100 derniers points
        const combined = [...prev, ...data.pop_history.filter(
          np => !prev.some(p => p.species_id === np.species_id && p.tick === np.tick)
        )];
        return combined.slice(-200);
      });
      if (data.species_stats) setSpeciesStats(data.species_stats);

      setStats(prev => {
        if (!prev) return prev;
        const alive = (data.creatures || []).filter(c => c.status === 'alive').length;
        return { ...prev, alive_creatures: alive };
      });
    });

    socket.on('species:update', (data) => {
      setSpecies(data.species || []);
    });

    return () => { socket.disconnect(); };
  }, []);

  const requestSpeciesRefresh = useCallback(() => {
    socketRef.current?.emit('request:species');
  }, []);

  return {
    connected,
    worldData,
    creatures,
    cadavres,
    species,
    events,
    tickInfo,
    stats,
    popHistory,
    speciesStats,
    requestSpeciesRefresh,
  };
}
