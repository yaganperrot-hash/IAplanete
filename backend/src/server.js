require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const createWorldRouter = require('./routes/world');
const speciesRoutes = require('./routes/species');
const eventsRoutes = require('./routes/events');
const createCivRouter = require('./routes/civilizations');
const { initSocketManager } = require('./socket/socketManager');
const { SimulationEngine } = require('./simulation/engine');
const { CivEngine } = require('./simulation/civEngine');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: ['http://localhost:3000', 'http://localhost:5173'], methods: ['GET', 'POST'] },
});

app.use(cors({ origin: ['http://localhost:3000', 'http://localhost:5173'] }));
app.use(express.json());

// L'engine est créé avant les routes pour pouvoir être injecté dans world router
const engine = new SimulationEngine(io);
const civEngine = new CivEngine(io);

app.use('/api/world', createWorldRouter(engine));
app.use('/api/species', speciesRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/civs', createCivRouter(civEngine));
app.get('/api/health', (req, res) => res.json({ status: 'ok', modes: ['planet', 'civilisations'] }));

initSocketManager(io);

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
  console.log(`\n🌍 AI Planet Backend → http://localhost:${PORT}`);
  console.log(`📡 WebSocket prêt`);
  console.log(`⚙️  Tick Planet : ${process.env.TICK_INTERVAL_MS || 15000}ms`);
  console.log(`⚙️  Tick Civilisations : ${process.env.CIV_TICK_INTERVAL_MS || 60000}ms\n`);
});

engine.init();
engine.start();

civEngine.init();
civEngine.start();
