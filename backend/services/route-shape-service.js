'use strict';

// ── Route Shape Service ────────────────────────────────────────────────────────
// Selects and returns the best available geometry for a journey segment.
//
// Priority order:
//   1. Official GTFS shape  — not yet available; placeholder returns null
//   2. OSRM road geometry   — road-routing-service.js (cached in memory)
//   3. Stop-connection fallback — straight lines between ordered segment stops
//
// COORDINATE CONVENTION:
//   All returned geometry uses GeoJSON [longitude, latitude] order.
//   The frontend (main.js drawJourneyOnMap) must convert to Leaflet [lat, lon].

const { getRoadGeometry } = require('./road-routing-service');

// ── Helper: build a GeoJSON LineString from an array of stop objects ───────────
// GeoJSON coordinate order: [longitude, latitude]
function stopsToLineString(stops) {
  return {
    type:        'LineString',
    coordinates: stops.map(s => [s.lon, s.lat]),   // GeoJSON: [lon, lat]
  };
}

// ── Placeholder: future GTFS shape provider ────────────────────────────────────
//
// When official GTFS shapes.txt data becomes available for Chennai (MTC),
// Mumbai (BEST), or Delhi (DTC / DIMTS), implement lookup here.
//
// A GTFS shapes.txt entry maps shape_id → ordered sequence of shape_pt_lat /
// shape_pt_lon / shape_pt_sequence rows.  This function should:
//   1. Resolve the GTFS shape_id for the given routeId.
//   2. Clip the shape to the fromStopId–toStopId segment.
//   3. Return a GeoJSON LineString geometry + approximate distance/duration.
//
// See: https://gtfs.org/schedule/reference/#shapestxt
//
// Return null when no official data is available (triggers fallback to OSRM).
async function getGtfsShape(/* cityId, routeId, fromStopId, toStopId */) {
  return null;
}

// ── Public API ─────────────────────────────────────────────────────────────────
/**
 * Get the best available geometry for a journey segment.
 *
 * Returns an object ready to be placed in the `routeGeometry` field of
 * the /api/journeys response:
 *
 * {
 *   source:          'osrm' | 'gtfs' | 'fallback',
 *   type:            'LineString',
 *   coordinates:     [[lon, lat], …],   ← GeoJSON order; frontend must flip for Leaflet
 *   distanceMeters:  number,
 *   durationSeconds: number,
 *   isOfficial:      boolean,
 * }
 *
 * This function never throws: OSRM failures are logged and the service
 * falls back to straight stop-connection lines (source: 'fallback').
 *
 * @param {object}   params
 * @param {string}   params.cityId
 * @param {string}   params.routeId
 * @param {string}   params.direction
 * @param {Array<{stopId: string, name: string, lat: number, lon: number}>} params.segmentStops
 *   Ordered stops from the boarding stop to the destination stop (inclusive).
 *
 * @returns {Promise<object>}
 */
async function getJourneyGeometry({ cityId, routeId, direction, segmentStops }) {
  // ── 1. Official GTFS shape (placeholder) ────────────────────────────────────
  try {
    const gtfs = await getGtfsShape(cityId, routeId);
    if (gtfs) {
      return {
        source:          'gtfs',
        type:            'LineString',
        coordinates:     gtfs.coordinates,
        distanceMeters:  gtfs.distanceMeters  || 0,
        durationSeconds: gtfs.durationSeconds || 0,
        isOfficial:      true,
      };
    }
  } catch (err) {
    console.error(`[route-shape] GTFS lookup error for ${routeId}: ${err.message}`);
  }

  // ── 2. OSRM road-following geometry ─────────────────────────────────────────
  try {
    const road = await getRoadGeometry({
      cityId,
      routeId,
      direction,
      stops: segmentStops,
    });
    return {
      source:          road.source,               // 'osrm'
      type:            'LineString',
      coordinates:     road.geometry.coordinates, // GeoJSON: [lon, lat]
      distanceMeters:  road.distanceMeters,
      durationSeconds: road.durationSeconds,
      isOfficial:      false,
    };
  } catch (err) {
    // Log technical details on the backend only; the frontend shows a generic message.
    console.error(`[route-shape] OSRM failed for ${routeId} (${cityId} ${direction}): ${err.message}`);
  }

  // ── 3. Fallback: straight lines between ordered segment stops ────────────────
  console.warn(`[route-shape] Using stop-connection fallback for ${routeId} (${cityId})`);
  return {
    source:          'fallback',
    type:            'LineString',
    coordinates:     stopsToLineString(segmentStops).coordinates,
    distanceMeters:  0,
    durationSeconds: 0,
    isOfficial:      false,
  };
}

module.exports = { getJourneyGeometry };
