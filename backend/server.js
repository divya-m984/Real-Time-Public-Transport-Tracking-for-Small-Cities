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

// ── Haversine (km) ────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Load city, route and stop data ────────────────────────────────────────────
const dataDir    = path.join(__dirname, '..', 'data');
const citiesJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json'), 'utf8'));

const citiesById     = {};   // cityId -> city config
const routesByCityId = {};   // cityId -> { routeId: routeObj }   (fwd + return)
const stopsByCityId  = {};   // cityId -> { stopId: stopObj }

citiesJson.cities.forEach(city => {
  citiesById[city.id] = city;

  // ── Load stops ──────────────────────────────────────────────────────────────
  const stopsFile = path.join(dataDir, city.stopsDataFile);
  const stopsData = JSON.parse(fs.readFileSync(stopsFile, 'utf8'));
  stopsByCityId[city.id] = {};
  stopsData.stops.forEach(s => { stopsByCityId[city.id][s.stopId] = s; });

  // ── Load forward routes ─────────────────────────────────────────────────────
  const routeFile = path.join(dataDir, city.routeDataFile);
  const routeData = JSON.parse(fs.readFileSync(routeFile, 'utf8'));
  routesByCityId[city.id] = {};

  routeData.routes.forEach(r => {
    routesByCityId[city.id][r.routeId] = r;

    // ── Auto-generate return route ────────────────────────────────────────────
    const returnId = r.routeId + 'R';
    const returnStops = [...r.stops].reverse().map((s, i) => ({
      stopId: s.stopId + 'r',
      name:   s.name,
      lat:    s.lat,
      lon:    s.lon,
    }));
    routesByCityId[city.id][returnId] = {
      routeId:     returnId,
      cityId:      r.cityId,
      routeName:   r.routeName + ' (Return)',
      routeNumber: (r.routeNumber || r.routeId) + 'R',
      direction:   'return',
      color:       r.color,
      stopIds:     [...r.stopIds].reverse(),
      stops:       returnStops,
    };
  });
});

const SUPPORTED_CITIES = Object.keys(citiesById);

// ── In-memory store: busLocations[cityId][busId] ──────────────────────────────
const busLocations = {};
SUPPORTED_CITIES.forEach(c => { busLocations[c] = {}; });

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  const perCity = {};
  SUPPORTED_CITIES.forEach(c => { perCity[c] = Object.keys(busLocations[c]).length; });
  res.json({
    status:      'ok',
    activeBuses: Object.values(perCity).reduce((n, v) => n + v, 0),
    perCity,
    uptime:      Math.floor(process.uptime()),
  });
});

// ── City configurations ───────────────────────────────────────────────────────
app.get('/api/cities', (req, res) => {
  res.json(citiesJson.cities);
});

// ── Routes for a city (forward routes only, for display) ─────────────────────
app.get('/api/routes', (req, res) => {
  const { cityId } = req.query;
  if (!cityId) return res.status(400).json({ error: 'cityId is required' });
  if (!routesByCityId[cityId]) return res.status(404).json({ error: `Unknown city: "${cityId}"` });
  // Return only forward routes (not auto-generated returns)
  const fwd = Object.values(routesByCityId[cityId]).filter(r => !r.routeId.endsWith('R'));
  res.json(fwd);
});

// ── Stops for a city — supports ?search= ─────────────────────────────────────
app.get('/api/stops', (req, res) => {
  const { cityId, search } = req.query;
  if (!cityId) return res.status(400).json({ error: 'cityId is required' });
  if (!stopsByCityId[cityId]) return res.status(404).json({ error: `Unknown city: "${cityId}"` });

  let stops = Object.values(stopsByCityId[cityId]);
  if (search) {
    const q = search.toLowerCase();
    stops = stops.filter(s => s.name.toLowerCase().includes(q));
  }
  res.json(stops);
});

// ── Get bus locations — supports ?routeIds=R1,R2 ─────────────────────────────
app.get('/api/locations', (req, res) => {
  const { cityId, routeIds } = req.query;
  if (!cityId) return res.status(400).json({ error: 'cityId is required' });
  if (!busLocations[cityId]) return res.status(404).json({ error: `Unknown city: "${cityId}"` });

  let locs = Object.values(busLocations[cityId]);
  if (routeIds) {
    const ids = new Set(routeIds.split(',').map(s => s.trim()).filter(Boolean));
    locs = locs.filter(l => ids.has(l.routeId));
  }
  res.json(locs);
});

// ── Journey search ────────────────────────────────────────────────────────────
app.get('/api/journeys', (req, res) => {
  const { cityId, fromStopId, toStopId } = req.query;

  if (!cityId)     return res.status(400).json({ error: 'cityId is required' });
  if (!fromStopId) return res.status(400).json({ error: 'fromStopId is required' });
  if (!toStopId)   return res.status(400).json({ error: 'toStopId is required' });

  if (!citiesById[cityId])
    return res.status(404).json({ error: `Unknown city: "${cityId}"` });

  const cityStops = stopsByCityId[cityId];

  if (!cityStops[fromStopId])
    return res.status(404).json({ error: `Stop "${fromStopId}" not found in ${cityId}` });
  if (!cityStops[toStopId])
    return res.status(404).json({ error: `Stop "${toStopId}" not found in ${cityId}` });
  if (fromStopId === toStopId)
    return res.status(400).json({ error: 'Origin and destination must be different stops' });

  // Check stop belongs to the correct city
  if (cityStops[fromStopId].cityId !== cityId)
    return res.status(400).json({ error: `Stop "${fromStopId}" does not belong to city "${cityId}"` });
  if (cityStops[toStopId].cityId !== cityId)
    return res.status(400).json({ error: `Stop "${toStopId}" does not belong to city "${cityId}"` });

  const fromStop = cityStops[fromStopId];
  const toStop   = cityStops[toStopId];
  const journeys = [];

  Object.values(routesByCityId[cityId]).forEach(route => {
    if (!route.stopIds) return;

    const fromIndex = route.stopIds.indexOf(fromStopId);
    const toIndex   = route.stopIds.indexOf(toStopId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex >= toIndex) return;

    // Stops in the relevant segment (boarding → destination inclusive)
    const segmentStopIds = route.stopIds.slice(fromIndex, toIndex + 1);
    const segmentStops   = segmentStopIds.map(id => cityStops[id]).filter(Boolean);

    const intermediateStops = segmentStops.slice(1, -1);  // exclude boarding and destination

    // Find active buses on this route
    const activeBuses = Object.values(busLocations[cityId])
      .filter(b => b.routeId === route.routeId)
      .map(bus => {
        const eta = estimateEtaMinutes(bus, route, fromIndex, cityStops);
        return {
          busId:          bus.busId,
          lat:            bus.lat,
          lon:            bus.lon,
          nextStop:       bus.nextStop,
          speedKmph:      bus.speedKmph,
          occupancyLevel: bus.occupancyLevel,
          timestamp:      bus.timestamp,
          etaMinutes:     eta,
          etaLabel:       eta === null ? 'ETA unavailable'
                          : eta === 0  ? 'Arriving soon'
                          : `~${eta} min (approx, simulated)`,
        };
      })
      // Sort: buses with ETA first, then by ETA ascending
      .sort((a, b) => {
        if (a.etaMinutes === null && b.etaMinutes === null) return 0;
        if (a.etaMinutes === null) return 1;
        if (b.etaMinutes === null) return -1;
        return a.etaMinutes - b.etaMinutes;
      });

    journeys.push({
      routeId:                route.routeId,
      routeNumber:            route.routeNumber || route.routeId,
      routeName:              route.routeName,
      direction:              route.direction || 'outbound',
      color:                  route.color,
      boardingStopIndex:      fromIndex,
      destinationStopIndex:   toIndex,
      intermediateStopCount:  intermediateStops.length,
      intermediateStops,
      routeSegmentStops:      segmentStops,
      activeBuses,
    });
  });

  // Sort journeys: most active buses first, then fewest intermediate stops
  journeys.sort((a, b) => {
    if (b.activeBuses.length !== a.activeBuses.length)
      return b.activeBuses.length - a.activeBuses.length;
    return a.intermediateStopCount - b.intermediateStopCount;
  });

  res.json({ cityId, fromStop, toStop, journeys });
});

// ── ETA estimate: minutes until a bus reaches the boarding stop ───────────────
function estimateEtaMinutes(bus, route, boardingStopIndex, cityStops) {
  // Match bus lat/lon to a stop in the route to find current stop index
  let busStopIndex = -1;
  const tolerance  = 0.0002;  // ~22 m

  for (let i = 0; i < route.stops.length; i++) {
    const s = route.stops[i];
    if (Math.abs(s.lat - bus.lat) < tolerance && Math.abs(s.lon - bus.lon) < tolerance) {
      busStopIndex = i;
      break;
    }
  }

  if (busStopIndex === -1)              return null;   // position unknown
  if (busStopIndex > boardingStopIndex) return null;   // bus has passed boarding stop
  if (busStopIndex === boardingStopIndex) return 0;    // at boarding stop

  // Sum Haversine distances from bus's current stop to boarding stop
  let totalKm = 0;
  for (let i = busStopIndex; i < boardingStopIndex; i++) {
    const s1 = route.stops[i];
    const s2 = route.stops[i + 1];
    if (s1 && s2) totalKm += haversineKm(s1.lat, s1.lon, s2.lat, s2.lon);
  }

  const speed = (bus.speedKmph && bus.speedKmph > 0) ? bus.speedKmph : 28;
  return Math.max(1, Math.round((totalKm / speed) * 60));
}

// ── Receive bus location update ───────────────────────────────────────────────
app.post('/api/update', (req, res) => {
  const { cityId, busId, lat, lon, routeId, speedKmph, nextStop, occupancyLevel } = req.body;

  if (typeof cityId !== 'string' || cityId.trim() === '')
    return res.status(400).json({ error: 'cityId must be a non-empty string' });

  const cId = cityId.trim();

  if (!SUPPORTED_CITIES.includes(cId))
    return res.status(400).json({ error: `cityId "${cId}" is not a supported city` });

  if (typeof busId !== 'string' || busId.trim() === '')
    return res.status(400).json({ error: 'busId must be a non-empty string' });

  if (typeof lat !== 'number' || !isFinite(lat) ||
      typeof lon !== 'number' || !isFinite(lon))
    return res.status(400).json({ error: 'lat and lon must be finite numbers' });

  if (routeId !== undefined && !routesByCityId[cId][routeId])
    return res.status(400).json({ error: `routeId "${routeId}" is not known for city "${cId}"` });

  const route = routeId ? routesByCityId[cId][routeId] : null;

  const locationData = {
    cityId:         cId,
    busId:          busId.trim(),
    routeId:        routeId        || null,
    routeName:      route          ? route.routeName : null,
    lat, lon,
    speedKmph:      typeof speedKmph      === 'number' ? speedKmph      : null,
    occupancyLevel: typeof occupancyLevel === 'string' ? occupancyLevel : null,
    nextStop:       typeof nextStop       === 'string' ? nextStop       : null,
    timestamp:      new Date().toISOString(),
  };

  busLocations[cId][locationData.busId] = locationData;
  io.to(`city:${cId}`).emit('locationUpdate', locationData);

  const info = [locationData.routeId, locationData.nextStop,
    locationData.speedKmph != null ? `${locationData.speedKmph} km/h` : null,
    locationData.occupancyLevel].filter(Boolean).join(' | ');

  console.log(
    `[${locationData.timestamp}] [${cId.padEnd(8)}] ${locationData.busId.padEnd(10)} ` +
    `(${lat.toFixed(4)}, ${lon.toFixed(4)}) ${info}`
  );

  res.status(200).json({ success: true });
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[${new Date().toISOString()}] Client connected    (id: ${socket.id})`);

  socket.on('joinCity', ({ cityId } = {}) => {
    if (!cityId || !SUPPORTED_CITIES.includes(cityId)) {
      socket.emit('serverError', { message: `Unknown cityId: "${cityId}"` });
      return;
    }
    SUPPORTED_CITIES.forEach(c => socket.leave(`city:${c}`));
    socket.join(`city:${cityId}`);
    socket.emit('initialLocations', Object.values(busLocations[cityId]));
    console.log(`[${new Date().toISOString()}] Socket ${socket.id} joined city:${cityId}`);
  });

  socket.on('leaveCity', ({ cityId } = {}) => {
    if (cityId) socket.leave(`city:${cityId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected (id: ${socket.id})`);
  });
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const totalRoutes = SUPPORTED_CITIES.reduce(
    (n, c) => n + Object.keys(routesByCityId[c]).length, 0
  );
  const totalStops = SUPPORTED_CITIES.reduce(
    (n, c) => n + Object.keys(stopsByCityId[c]).length, 0
  );
  console.log('\n Transit Live India — Backend (Journey Search)');
  console.log(' ===============================================');
  console.log(` Server  : http://localhost:${PORT}`);
  console.log(` Cities  : ${SUPPORTED_CITIES.join(', ')}`);
  console.log(` Routes  : ${totalRoutes} (incl. auto-generated return routes)`);
  console.log(` Stops   : ${totalStops} canonical stops loaded`);
  console.log('');
  console.log('  GET  /health                                       — health check');
  console.log('  GET  /api/cities                                   — city configs');
  console.log('  GET  /api/stops?cityId=X[&search=Y]               — stops for a city');
  console.log('  GET  /api/routes?cityId=X                         — routes for a city');
  console.log('  GET  /api/locations?cityId=X[&routeIds=R1,R2]     — bus positions');
  console.log('  GET  /api/journeys?cityId=X&fromStopId=A&toStopId=B — journey search');
  console.log('  POST /api/update                                   — receive bus update\n');
});
