# TECH_STACK.md — WorldIA Civilisations

## Runtime & Serveur
| Composant | Version / Détail |
|---|---|
| Node.js | 24+ (requis pour `node:sqlite` natif) |
| Express | 4.x |
| Socket.io | 4.x |
| SQLite | `node:sqlite` (built-in Node 24) — **pas de Docker, pas de PostgreSQL** |

## LLM
| Provider | Modèle | Config |
|---|---|---|
| Ollama (local, défaut) | `mistral-nemo` (12B) | `OLLAMA_HOST`, `OLLAMA_MODEL` dans `.env` |
| Gemini (cloud, fallback) | `gemini-flash` | `GEMINI_API_KEY` dans `.env` |
| OpenRouter (cloud, option) | variable | quotas limités |
| Mock (rule-based) | — | activé si Ollama unavailable |

Fichier actif : `backend/src/llm/civOllamaLLM.js` (avec fallback → `civMockLLM.js`)

**Appels LLM : en série uniquement** — pas de parallélisme.
- Timeout Ollama : 30s
- Délai entre civs : 1s (local) / 5s (cloud)

## Matériel recommandé
| Cas | RAM | GPU VRAM |
|---|---|---|
| Ollama mistral-nemo 12B | 32 Go | 16 Go |
| Gemini Flash (cloud) | toute config | N/A |

## Carte
- Taille : 256×192 cases
- Algo : Simplex Noise + FBM (4 octaves), 100% déterministe (seed)
- 15 biomes + 5 gisements minéraux

## Ports
| Service | Port |
|---|---|
| Backend Express | 4000 |
| Frontend Vite | 3000 |

## Variables `.env`
```
DATABASE_FILE=./data/aiplanet.db
PORT=4000
CIV_TICK_INTERVAL_MS=60000
LLM_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=mistral-nemo
GEMINI_API_KEY=...
```

## Démarrage
```bash
cd C:\IAplanete
npm run dev   # lance backend + frontend en parallèle
```
Si port 4000 occupé : `taskkill /F /IM node.exe` (CMD Windows)
