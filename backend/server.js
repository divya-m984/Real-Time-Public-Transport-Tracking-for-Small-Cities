const express  = require('express');
const http     = require('http');
const socketIo = require('socket.io');
const cors     = require('cors');
const fs       = require('fs');
const path     = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// ── Load Chennai route data ───────────────────────────────────────────────────
const routeDataPath = path.join(__dirname, '..', 'data', 'chennai-routes.json');
const routeData     = JSON.parse(fs.readFileSync(routeDataPath, 'utf8'));
const routesById    = {};
routeData.routes.forEach(r => { routesById[r.routeId] = r; });

// ── In-memory store: busId -> latest location ─────────────────────────────────
const busLocations = {};

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const buses       = Object.values(busLocations);
  const activeRoutes = [...new Set(buses.map(b => b.routeId).filter(Boolean))];
  res.json({
    status:       'ok',
    activeBuses:  buses.length,
    activeRoutes: activeRoutes.length,
    uptime:       Math.floor(process.uptime()),
  });
});

// ── Route definitions ─────────────────────────────────────────────────────────
app.get('/api/routes', (req, res) => {
  res.json(routeData.routes);
});

// ── All stops (flat list with routeId + routeName) ────────────────────────────
app.get('/api/stops', (req, res) => {
  const stops = [];
  routeData.routes.forEach(r => {
    r.stops.forEach(s => stops.push({ ...s, routeId: r.routeId, routeName: r.routeName }));
  });
  res.json(stops);
});

// ── Get all current bus locations ─────────────────────────────────────────────
app.get('/api/locations', (req, res) => {
  res.json(Object.values(busLocations));
});

// ── Receive bus location update ───────────────────────────────────────────────
app.post('/api/update', (req, res) => {
  const { busId, lat, lon, routeId, speedKmph, nextStop, occupancyLevel } = req.body;

  if (typeof busId !== 'string' || busId.trim() === '') {
    return res.status(400).json({ error: 'busId must be a non-empty string' });
  }
  if (typeof lat !== 'number' || !isFinite(lat) ||
      typeof lon !== 'number' || !isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon must be finite numbers' });
  }
  if (routeId !== undefined && !routesById[routeId]) {
    return res.status(400).json({ error: `routeId "${routeId}" is not a known route` });
  }

  const route = routeId ? routesById[routeId] : null;

  const locationData = {
    busId:          busId.trim(),
    routeId:        routeId        || null,
    routeName:      route          ? route.routeName : null,
    lat,
    lon,
    speedKmph:      typeof speedKmph      === 'number' ? speedKmph      : null,
    occupancyLevel: typeof occupancyLevel === 'string' ? occupancyLevel : null,
    nextStop:       typeof nextStop       === 'string' ? nextStop       : null,
    timestamp:      new Date().toISOString(),
  };

  busLocations[locationData.busId] = locationData;
  io.emit('locationUpdate', locationData);

  const info = [
    locationData.routeId,
    locationData.nextStop,
    locationData.speedKmph != null ? `${locationData.speedKmph} km/h` : null,
    locationData.occupancyLevel,
  ].filter(Boolean).join(' | ');

  console.log(
    `[${locationData.timestamp}] ${locationData.busId.padEnd(10)} ` +
    `(${lat.toFixed(4)}, ${lon.toFixed(4)}) ${info}`
  );

  res.status(200).json({ success: true });
});

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected    (id: ${socket.id})`);
  socket.emit('initialLocations', Object.values(busLocations));

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected (id: ${socket.id})`);
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('\n Chennai Transit Live — Backend');
  console.log(' ================================');
  console.log(` Server  : http://localhost:${PORT}`);
  console.log(` Routes  : ${routeData.routes.length} Chennai corridors loaded`);
  console.log('');
  console.log('  GET  /health         — health check');
  console.log('  GET  /api/routes     — route definitions');
  console.log('  GET  /api/stops      — all stops');
  console.log('  GET  /api/locations  — live bus positions');
  console.log('  POST /api/update     — receive bus update\n');
});
