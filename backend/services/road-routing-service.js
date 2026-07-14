'use strict';

// ── Road Routing Service ───────────────────────────────────────────────────────
// Fetches road-following geometry from OSRM for an ordered list of stops.
//
// COORDINATE CONVENTION (important — two systems are in use):
//   OSRM API input:   longitude,latitude pairs separated by semicolons
//   GeoJSON output:   coordinates are [longitude, latitude]  ← this service returns GeoJSON
//   Leaflet LatLng:   [latitude, longitude]                  ← frontend must flip before drawing
//
// The frontend (main.js) is responsible for converting [lon, lat] → [lat, lon]
// when creating Leaflet polyline coordinates.

const OSRM_BASE_URL     = process.env.OSRM_BASE_URL     || 'https://router.project-osrm.org';
const REQUEST_TIMEOUT_MS = parseInt(process.env.OSRM_TIMEOUT_MS || '8000', 10);
const CACHE_TTL_MS       = 6 * 60 * 60 * 1000;   // 6 hours; reset on server restart

const isDev = process.env.NODE_ENV !== 'production';

// ── In-memory geometry cache ───────────────────────────────────────────────────
// Key:   "cityId:routeId:direction:stopId1.stopId2…stopIdN"
// Value: { result: <geometry object>, cachedAt: <timestamp ms> }
//
// Only successful OSRM responses are cached; errors are never stored.
const geometryCache = new Map();

function buildCacheKey(cityId, routeId, direction, stops) {
  const stopPart = stops.map(s => s.stopId).join('.');
  return `${cityId}:${routeId}:${direction}:${stopPart}`;
}

function isCacheValid(entry) {
  return entry && (Date.now() - entry.cachedAt) < CACHE_TTL_MS;
}

// ── Coordinate validation ──────────────────────────────────────────────────────
function isValidStop(stop) {
  return (
    stop != null &&
    typeof stop.lat === 'number' && isFinite(stop.lat) &&
    typeof stop.lon === 'number' && isFinite(stop.lon) &&
    stop.lat >= -90  && stop.lat <= 90 &&
    stop.lon >= -180 && stop.lon <= 180
  );
}

// ── OSRM fetch ─────────────────────────────────────────────────────────────────
// Constructs a waypoint string from ALL ordered stops (not just first + last),
// so the generated path is forced through every stop in the segment.
//
// OSRM route service:
//   GET /route/v1/driving/{lon1,lat1};{lon2,lat2};…
//       ?overview=full&geometries=geojson&steps=false
//
// Returns a normalised object:
//   {
//     source:          'osrm',
//     geometry:        { type: 'LineString', coordinates: [[lon, lat], …] },
//     distanceMeters:  number,
//     durationSeconds: number,
//   }
async function fetchOsrmGeometry(stops) {
  for (const stop of stops) {
    if (!isValidStop(stop)) {
      throw new Error(`Invalid stop coordinates for "${stop && stop.stopId}": lat=${stop && stop.lat} lon=${stop && stop.lon}`);
    }
  }

  // OSRM expects longitude,latitude (same as GeoJSON)
  const coordStr = stops.map(s => `${s.lon},${s.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OSRM request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new Error(`OSRM network error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`OSRM returned HTTP ${response.status} ${response.statusText}`);
  }

  let json;
  try {
    json = await response.json();
  } catch {
    throw new Error('OSRM returned invalid JSON');
  }

  if (!json.routes || !Array.isArray(json.routes) || json.routes.length === 0) {
    throw new Error(`OSRM returned no routes (code: ${json.code})`);
  }

  const route = json.routes[0];
  const geom  = route.geometry;

  if (
    !geom ||
    geom.type !== 'LineString' ||
    !Array.isArray(geom.coordinates) ||
    geom.coordinates.length < 2
  ) {
    throw new Error('OSRM returned an invalid or empty LineString geometry');
  }

  return {
    source:          'osrm',
    // GeoJSON: coordinates are [longitude, latitude]
    geometry:        geom,
    distanceMeters:  typeof route.distance === 'number' ? route.distance : 0,
    durationSeconds: typeof route.duration === 'number' ? route.duration : 0,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Get road-following geometry for an ordered list of journey-segment stops.
 *
 * Checks the in-memory cache first; only calls OSRM on a cache miss.
 * Only successful results are stored in the cache.
 *
 * @param {object}   params
 * @param {string}   params.cityId
 * @param {string}   params.routeId
 * @param {string}   params.direction   e.g. 'outbound' or 'return'
 * @param {Array<{stopId: string, name: string, lat: number, lon: number}>} params.stops
 *
 * @returns {Promise<{
 *   source:          string,
 *   geometry:        { type: 'LineString', coordinates: [number, number][] },
 *   distanceMeters:  number,
 *   durationSeconds: number,
 *   isOfficial:      false,
 *   _label:          string,
 * }>}
 */
async function getRoadGeometry({ cityId, routeId, direction, stops }) {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new Error('getRoadGeometry requires at least 2 stops');
  }

  const cacheKey = buildCacheKey(cityId, routeId, direction, stops);
  const cached   = geometryCache.get(cacheKey);

  if (isCacheValid(cached)) {
    if (isDev) console.log(`[road-routing] CACHE HIT  ${cacheKey}`);
    // Return a shallow copy so callers cannot mutate the cached entry
    return { ...cached.result };
  }

  if (isDev) console.log(`[road-routing] CACHE MISS ${cacheKey}`);

  const result = await fetchOsrmGeometry(stops);
  result.isOfficial = false;
  result._label     = 'Road-network demonstration route';

  geometryCache.set(cacheKey, { result, cachedAt: Date.now() });
  return { ...result };
}

module.exports = { getRoadGeometry };
