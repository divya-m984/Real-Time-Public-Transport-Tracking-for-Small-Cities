/**
 * Chennai Transit Live — Bus Simulator
 *
 * Simulates 8 buses (2 per route) across 4 Chennai route corridors.
 * Buses move stop-by-stop and reverse direction at each terminus.
 * Sends updates to the backend every 2–4 seconds (random interval).
 *
 * DEMO ONLY — not affiliated with MTC or CUMTA.
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BACKEND_URL    = process.env.BACKEND_URL || 'http://localhost:3000/api/update';
const MIN_INTERVAL   = 2000;
const MAX_INTERVAL   = 4000;

// ── Load Chennai route data ───────────────────────────────────────────────────
const routeDataPath = path.join(__dirname, '..', 'data', 'chennai-routes.json');
const { routes }    = JSON.parse(fs.readFileSync(routeDataPath, 'utf8'));

const OCCUPANCY_LEVELS = ['Low', 'Medium', 'High'];

// ── Build bus roster: 2 buses per route, staggered start positions ────────────
const buses = [];
routes.forEach(route => {
  const mid = Math.floor(route.stops.length / 2);
  buses.push({
    id:        `MTC-${route.routeId.replace('CHN-', '')}A`,
    routeId:   route.routeId,
    stopIndex: 0,
    direction: 1,
    occupancy: randomOccupancy(),
    occupancyCountdown: Math.floor(3 + Math.random() * 5),
  });
  buses.push({
    id:        `MTC-${route.routeId.replace('CHN-', '')}B`,
    routeId:   route.routeId,
    stopIndex: mid,
    direction: 1,
    occupancy: randomOccupancy(),
    occupancyCountdown: Math.floor(1 + Math.random() * 4),
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomOccupancy() {
  return OCCUPANCY_LEVELS[Math.floor(Math.random() * OCCUPANCY_LEVELS.length)];
}

function randomSpeed() {
  return Math.round(15 + Math.random() * 30); // 15–45 km/h
}

// ── Send one location update ──────────────────────────────────────────────────

async function sendLocation(bus) {
  const route     = routes.find(r => r.routeId === bus.routeId);
  const stop      = route.stops[bus.stopIndex];
  const nextIdx   = bus.stopIndex + bus.direction;
  const nextStop  = route.stops[nextIdx] ? route.stops[nextIdx].name : stop.name;
  const speed     = randomSpeed();

  // Occasionally change occupancy
  bus.occupancyCountdown--;
  if (bus.occupancyCountdown <= 0) {
    bus.occupancy          = randomOccupancy();
    bus.occupancyCountdown = Math.floor(3 + Math.random() * 5);
  }

  try {
    await axios.post(BACKEND_URL, {
      busId:          bus.id,
      lat:            stop.lat,
      lon:            stop.lon,
      routeId:        bus.routeId,
      speedKmph:      speed,
      nextStop,
      occupancyLevel: bus.occupancy,
    });

    const routeLabel = `${bus.routeId} ${route.routeName}`;
    console.log(
      `  ${bus.id.padEnd(8)}  [${bus.occupancy.padEnd(6)}]  ` +
      `${routeLabel.padEnd(30)}  -> ${stop.name}`
    );
  } catch (err) {
    console.error(`  ${bus.id.padEnd(8)}  ERROR: ${err.message}`);
  }

  // Advance stop; reverse direction at each terminus
  bus.stopIndex += bus.direction;
  const last = route.stops.length - 1;
  if (bus.stopIndex > last) {
    bus.direction = -1;
    bus.stopIndex = last - 1;
  } else if (bus.stopIndex < 0) {
    bus.direction = 1;
    bus.stopIndex = 1;
  }
}

// ── Main tick loop ────────────────────────────────────────────────────────────

function tick() {
  const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
  console.log(`\n[${ts}]`);
  buses.forEach(bus => sendLocation(bus));
  const delay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  setTimeout(tick, delay);
}

// ── Startup ───────────────────────────────────────────────────────────────────

console.log('\n Chennai Transit Live — Simulator');
console.log(' ==================================');
console.log(` Backend  : ${BACKEND_URL}`);
console.log(` Buses    : ${buses.length} (${routes.length} routes)`);
console.log(` Interval : ${MIN_INTERVAL / 1000}–${MAX_INTERVAL / 1000}s (random)\n`);
console.log(` Bus ID    Occupancy  Route                           Current Stop`);
console.log(` ${'─'.repeat(70)}`);

// Fire immediately, then start the timed loop
buses.forEach(bus => sendLocation(bus));
const firstDelay = MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
setTimeout(tick, firstDelay);
