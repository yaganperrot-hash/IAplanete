import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

export function useCivSocket() {
  const [connected, setConnected] = useState(false);
  const [worldData, setWorldData] = useState(null);
  const [biomes, setBiomes] = useState([]);
  const [civs, setCivs] = useState([]);
  const [territories, setTerritories] = useState([]);
  const [events, setEvents] = useState([]);
  const [thoughtLogs, setThoughtLogs] = useState([]);
  const [tick, setTick] = useState(0);
  const [year, setYear] = useState(1);
  const [season, setSeason] = useState('ete');
  const [monthName, setMonthName] = useState('Juin');
  const [dayOfYear, setDayOfYear] = useState(1);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('request:civ:init');
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('civ:world:init', (data) => {
      if (data.error) { console.error('Civ init error:', data.error); return; }
      setWorldData(data.world);
      setBiomes(data.biomes || []);
      setCivs(data.civs || []);
      setTerritories(data.territories || []);
      setEvents(data.events || []);
      setThoughtLogs(data.thought_logs || []);
      setTick(data.world?.tick || 0);
    });

    socket.on('civ:tick:update', (data) => {
      setCivs(data.civs || []);
      setTerritories(data.territories || []);
      setTick(data.tick || 0);
      if (data.year)      setYear(data.year);
      if (data.season)    setSeason(data.season);
      if (data.monthName) setMonthName(data.monthName);
      if (data.dayOfYear) setDayOfYear(data.dayOfYear);
      if (data.new_events?.length) {
        setEvents(prev => [...data.new_events, ...prev].slice(0, 100));
      }
      if (data.recent_events?.length) setEvents(data.recent_events);
      if (data.thought_logs?.length) setThoughtLogs(data.thought_logs);
    });

    return () => socket.disconnect();
  }, []);

  const refreshCivs = useCallback(() => {
    fetch('http://localhost:4000/api/civs')
      .then(r => r.json())
      .then(d => { if (d.civs) setCivs(d.civs); })
      .catch(() => {});
  }, []);

  return { connected, worldData, biomes, civs, territories, events, thoughtLogs, tick, year, season, monthName, dayOfYear, refreshCivs };
}
