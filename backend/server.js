const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// In-memory store: busId -> latest location data
const busLocations = {};

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeBuses: Object.keys(busLocations).length,
    uptime: Math.floor(process.uptime()),
  });
});

// ── Receive bus location update ───────────────────────────────────────────────
app.post('/api/update', (req, res) => {
  const { busId, lat, lon, route, stopName } = req.body;

  // Validate busId
  if (typeof busId !== 'string' || busId.trim() === '') {
    return res.status(400).json({ error: 'busId must be a non-empty string' });
  }

  // Validate lat / lon
  if (typeof lat !== 'number' || !isFinite(lat) ||
      typeof lon !== 'number' || !isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon must be finite numbers' });
  }

  const locationData = {
    busId: busId.trim(),
    lat,
    lon,
    route: typeof route === 'string' ? route : null,
    stopName: typeof stopName === 'string' ? stopName : null,
    timestamp: new Date().toISOString(),
  };

  busLocations[locationData.busId] = locationData;

  // Broadcast to all connected frontend clients
  io.emit('locationUpdate', locationData);

  const stopInfo = locationData.stopName ? ` — ${locationData.stopName}` : '';
  console.log(`[${locationData.timestamp}] ${locationData.busId} at (${lat.toFixed(4)}, ${lon.toFixed(4)})${stopInfo}`);

  res.status(200).json({ success: true });
});

// ── Get all current bus locations ─────────────────────────────────────────────
app.get('/api/locations', (req, res) => {
  res.json(Object.values(busLocations));
});

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[${new Date().toISOString()}] Client connected   (id: ${socket.id})`);

  // Send current state to the newly connected client
  socket.emit('initialLocations', Object.values(busLocations));

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected (id: ${socket.id})`);
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on http://localhost:${PORT}`);
  console.log('  POST /api/update    — receive bus location');
  console.log('  GET  /api/locations — get all bus locations');
  console.log('  GET  /health        — health check\n');
});
