/**
 * Maplewood City Bus Simulator
 *
 * Simulates 4 buses running on 2 routes in the fictional small city of Maplewood.
 * Buses move stop-by-stop and reverse direction at each terminus.
 * Location updates are sent to the backend every 3 seconds.
 *
 * Routes:
 *   Route A — Railway Station <-> North Market  (Bus-01, Bus-02)
 *   Route B — West Park <-> East Gate           (Bus-03, Bus-04)
 */

const axios = require('axios');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000/api/update';
const UPDATE_INTERVAL_MS = 3000;

// ── Route definitions ─────────────────────────────────────────────────────────

const ROUTES = {
  'Route-A': {
    name: 'Railway Station — North Market',
    stops: [
      { lat: 18.5050, lon: 73.8450, name: 'Railway Station' },
      { lat: 18.5080, lon: 73.8455, name: 'Nehru Chowk' },
      { lat: 18.5110, lon: 73.8460, name: 'Bus Stand' },
      { lat: 18.5140, lon: 73.8465, name: 'Town Hall' },
      { lat: 18.5170, lon: 73.8470, name: 'Central Market' },
      { lat: 18.5200, lon: 73.8475, name: 'City Square' },
      { lat: 18.5230, lon: 73.8480, name: 'College Road' },
      { lat: 18.5260, lon: 73.8490, name: 'Green Park' },
      { lat: 18.5290, lon: 73.8500, name: 'North Market' },
    ],
  },
  'Route-B': {
    name: 'West Park — East Gate',
    stops: [
      { lat: 18.5200, lon: 73.8300, name: 'West Park' },
      { lat: 18.5200, lon: 73.8340, name: 'Hospital Road' },
      { lat: 18.5200, lon: 73.8380, name: 'Civil Lines' },
      { lat: 18.5200, lon: 73.8420, name: 'City Center' },
      { lat: 18.5200, lon: 73.8460, name: 'Post Office' },
      { lat: 18.5200, lon: 73.8500, name: 'IT Park' },
      { lat: 18.5200, lon: 73.8540, name: 'Lake View' },
      { lat: 18.5200, lon: 73.8580, name: 'East Gate' },
    ],
  },
};

// ── Bus state (staggered start positions so buses don't overlap) ──────────────

const buses = [
  { id: 'Bus-01', routeKey: 'Route-A', stopIndex: 0, direction: 1 },
  { id: 'Bus-02', routeKey: 'Route-A', stopIndex: 4, direction: 1 },
  { id: 'Bus-03', routeKey: 'Route-B', stopIndex: 0, direction: 1 },
  { id: 'Bus-04', routeKey: 'Route-B', stopIndex: 4, direction: 1 },
];

// ── Send location update to backend ──────────────────────────────────────────

async function sendLocation(bus) {
  const route = ROUTES[bus.routeKey];
  const stop = route.stops[bus.stopIndex];

  try {
    await axios.post(BACKEND_URL, {
      busId: bus.id,
      lat: stop.lat,
      lon: stop.lon,
      route: route.name,
      stopName: stop.name,
    });
    console.log(`  ${bus.id}  ${route.name.padEnd(36)} => ${stop.name}`);
  } catch (err) {
    console.error(`  ${bus.id}  ERROR: ${err.message}`);
  }

  // Advance to the next stop; reverse direction at each terminus
  bus.stopIndex += bus.direction;
  const lastIndex = route.stops.length - 1;
  if (bus.stopIndex > lastIndex) {
    bus.direction = -1;
    bus.stopIndex = lastIndex - 1;
  } else if (bus.stopIndex < 0) {
    bus.direction = 1;
    bus.stopIndex = 1;
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────

console.log('Maplewood City Bus Simulator');
console.log('============================');
console.log(`Backend : ${BACKEND_URL}`);
console.log(`Buses   : ${buses.length} (${Object.keys(ROUTES).length} routes)`);
console.log(`Interval: ${UPDATE_INTERVAL_MS / 1000}s\n`);

// Send immediately on startup, then repeat on interval
buses.forEach((bus) => sendLocation(bus));
setInterval(() => {
  console.log(`[${new Date().toISOString()}]`);
  buses.forEach((bus) => sendLocation(bus));
}, UPDATE_INTERVAL_MS);
