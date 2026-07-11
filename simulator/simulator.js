/**
 * Transit Live India — Multi-City Bus Simulator
 *
 * Simulates buses across Chennai, Mumbai, and Delhi (or a single city).
 *
 * Usage:
 *   CITY=all      node simulator.js   (default — all three cities)
 *   CITY=chennai  node simulator.js
 *   CITY=mumbai   node simulator.js
 *   CITY=delhi    node simulator.js
 *
 * DEMO ONLY — not affiliated with any official transport authority.
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BACKEND_URL  = process.env.BACKEND_URL || 'http://localhost:3000/api/update';
const CITY_ARG     = (process.env.CITY || 'all').toLowerCase();
const MIN_INTERVAL = 2000;
const MAX_INTERVAL = 4000;

const OCCUPANCY_LEVELS = ['Low', 'Medium', 'High'];

// Collision-safe bus ID prefix per city
const CITY_PREFIX = { chennai: 'CHE', mumbai: 'MUM', delhi: 'DEL' };

// ── Load city manifest ────────────────────────────────────────────────────────
const dataDir    = path.join(__dirname, '..', 'data');
const citiesJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json'), 'utf8'));

const selectedCities = CITY_ARG === 'all'
  ? citiesJson.cities
  : citiesJson.cities.filter(c => c.id === CITY_ARG);

if (selectedCities.length === 0) {
  console.error(
    `Unknown city: "${CITY_ARG}". ` +
    `Supported values: all, ${citiesJson.cities.map(c => c.id).join(', ')}`
  );
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomOccupancy() {
  return OCCUPANCY_LEVELS[Math.floor(Math.random() * OCCUPANCY_LEVELS.length)];
}

function randomSpeed() {
  return Math.round(15 + Math.random() * 30);  // 15–45 km/h
}

// ── Build bus roster from a city's route data ─────────────────────────────────
// 2 buses per route, staggered start positions. Bus IDs are city-prefixed.

function buildBuses(city, routes) {
  const prefix = CITY_PREFIX[city.id] || city.id.toUpperCase().slice(0, 3);
  const buses  = [];

  routes.forEach((route, routeIdx) => {
    const base = 101 + routeIdx * 2;
    const mid  = Math.floor(route.stops.length / 2);

    buses.push({
      id:                 `${prefix}-${base}`,
      cityId:             city.id,
      routeId:            route.routeId,
      stops:              route.stops,
      stopIndex:          0,
      direction:          1,
      occupancy:          randomOccupancy(),
      occupancyCountdown: Math.floor(3 + Math.random() * 5),
    });

    buses.push({
      id:                 `${prefix}-${base + 1}`,
      cityId:             city.id,
      routeId:            route.routeId,
      stops:              route.stops,
      stopIndex:          mid,
      direction:          1,
      occupancy:          randomOccupancy(),
      occupancyCountdown: Math.floor(1 + Math.random() * 4),
    });
  });

  return buses;
}

// Load routes and build buses for each selected city
const allBuses = [];

selectedCities.forEach(city => {
  const routeFile = path.join(dataDir, city.routeDataFile);
  const { routes } = JSON.parse(fs.readFileSync(routeFile, 'utf8'));
  allBuses.push(...buildBuses(city, routes));
});

// ── Send one location update ──────────────────────────────────────────────────

async function sendLocation(bus) {
  const stop     = bus.stops[bus.stopIndex];
  const nextIdx  = bus.stopIndex + bus.direction;
  const nextStop = bus.stops[nextIdx] ? bus.stops[nextIdx].name : stop.name;
  const speed    = randomSpeed();

  // Occasionally rotate occupancy level
  bus.occupancyCountdown--;
  if (bus.occupancyCountdown <= 0) {
    bus.occupancy          = randomOccupancy();
    bus.occupancyCountdown = Math.floor(3 + Math.random() * 5);
  }

  try {
    await axios.post(BACKEND_URL, {
      cityId:         bus.cityId,
      busId:          bus.id,
      lat:            stop.lat,
      lon:            stop.lon,
      routeId:        bus.direction === -1 ? bus.routeId + 'R' : bus.routeId,
      speedKmph:      speed,
      nextStop,
      occupancyLevel: bus.occupancy,
    });

    console.log(
      `  [${bus.cityId.padEnd(8)}]  ${bus.id.padEnd(8)}  [${bus.occupancy.padEnd(6)}]` +
      `  ${bus.routeId.padEnd(8)}  -> ${stop.name}`
    );
  } catch (err) {
    console.error(`  [${bus.cityId}]  ${bus.id}  ERROR: ${err.message}`);
  }

  // Advance to the next stop; reverse direction at each terminus
  bus.stopIndex += bus.direction;
  const last = bus.stops.length - 1;
  if (bus.stopIndex > last) {
    bus.direction = -1;
    bus.stopIndex = last - 1;
  } else if (bus.stopIndex < 0) {
    bus.direction = 1;
    bus.stopIndex = 1;
  }
}

// ── Main tick: send all buses, then schedule next tick ───────────────────────

function tick() {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`\n[${ts}]`);
  allBuses.forEach(bus => sendLocation(bus));
  const delay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  setTimeout(tick, delay);
}

// ── Startup ───────────────────────────────────────────────────────────────────

const cityNames = selectedCities.map(c => c.name).join(', ');
console.log('\n Transit Live India — Simulator');
console.log(' ================================');
console.log(` Backend  : ${BACKEND_URL}`);
console.log(` Cities   : ${cityNames}`);
console.log(` Buses    : ${allBuses.length}`);
console.log(` Interval : ${MIN_INTERVAL / 1000}–${MAX_INTERVAL / 1000}s (random)\n`);
console.log(` City      Bus ID    Occupancy  Route     Current Stop`);
console.log(` ${'─'.repeat(65)}`);

// Fire immediately, then start the timed loop
allBuses.forEach(bus => sendLocation(bus));
const firstDelay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
setTimeout(tick, firstDelay);
