const BASE = '/api';

export async function fetchWorld() {
  const res = await fetch(`${BASE}/world`);
  return res.json();
}

export async function fetchBiomes() {
  const res = await fetch(`${BASE}/world/biomes`);
  return res.json();
}

export async function fetchSpecies() {
  const res = await fetch(`${BASE}/species`);
  return res.json();
}

export async function fetchSpeciesDetail(id) {
  const res = await fetch(`${BASE}/species/${id}`);
  return res.json();
}

export async function createSpecies(data) {
  const res = await fetch(`${BASE}/species`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function previewStats(params) {
  const res = await fetch(`${BASE}/species/preview-stats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

export async function fetchEvents(limit = 50) {
  const res = await fetch(`${BASE}/events?limit=${limit}`);
  return res.json();
}

export async function fetchThoughts(limit = 30) {
  const res = await fetch(`${BASE}/events/thoughts?limit=${limit}`);
  return res.json();
}

export async function fetchLeaderboard() {
  const res = await fetch(`${BASE}/world/leaderboard`);
  return res.json();
}

export async function fetchPopHistory(speciesId, limit = 100) {
  const res = await fetch(`${BASE}/species/${speciesId}/population-history?limit=${limit}`);
  return res.json();
}

export async function resetWorld() {
  const res = await fetch(`${BASE}/world/reset`, { method: 'POST' });
  return res.json();
}
