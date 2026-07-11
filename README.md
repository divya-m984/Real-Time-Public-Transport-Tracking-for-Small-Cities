# Transit Live India

> A passenger journey-search demo for Chennai, Mumbai, and Delhi — powered by simulated real-time bus data.
> Built as a student/portfolio project using Node.js, Express, Socket.IO, Leaflet.js, and vanilla JavaScript.

**All route, stop, and vehicle data is simulated for educational and portfolio demonstration only.
Not affiliated with MTC, BEST, DTC, DMRC, MMRDA, CUMTA, or any official transport authority.**

---

## What it does

Passengers enter a **From** stop and a **To** stop, press **Find Buses**, and see every direct route
that connects those two stops — including live bus positions and approximate ETAs.
The map draws the relevant route segments and highlights the origin and destination stops.
Only buses on matching routes appear; the map is blank before a search.

---

## Features

- Searchable combobox dropdowns for stop selection (keyboard-navigable: ↑ ↓ Enter Escape)
- Swap button to instantly reverse origin and destination
- Direct-route matching: a route matches only when the origin stop appears before the destination stop in its ordered stop list
- Return-direction routes auto-generated at startup — searching Koyambedu → Central shows buses travelling in that direction
- Live bus markers on the map, filtered to matched routes only, updated every 2–4 s via Socket.IO
- Approximate ETA displayed per bus: distance to boarding stop divided by reported speed (labelled "approx, simulated")
- Occupancy indicator per bus: Low / Medium / High
- Map draws route-segment polylines and green (origin) / red (destination) circle markers; auto-fits bounds
- Three-city support: Chennai, Mumbai, Delhi — independent stop lists, routes, socket rooms, and map centres
- City selection persisted to `localStorage`; defaults to Chennai
- Connection status pill with offline/reconnecting banner
- No build step — frontend served as static files by the same Express server

---

## Supported Cities

| City    | Map Centre         | Routes | Stops | Buses (simulated) | Bus ID prefix |
|---------|--------------------|--------|-------|-------------------|---------------|
| Chennai | 13.0827, 80.2707   | 4      | 17    | 8                 | CHE-          |
| Mumbai  | 19.0760, 72.8777   | 5      | 15    | 10                | MUM-          |
| Delhi   | 28.6139, 77.2090   | 5      | 20    | 10                | DEL-          |

28 buses total across all three cities (`CITY=all`). The backend also auto-generates a return
route for every forward route (28 routes including returns loaded at startup).

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Node.js, Express 4, Socket.IO 4     |
| Frontend  | HTML5, CSS3, Vanilla JavaScript     |
| Map       | Leaflet.js (loaded from CDN)        |
| Simulator | Node.js, Axios                      |
| Data      | Hand-authored GTFS-style JSON files |

---

## Architecture

```
Simulator  --POST /api/update-->  Express backend  --Socket.IO room-->  Browser
(every 2–4 s,                     validates + stores                    journey search UI
 city-prefixed bus IDs)            per-city in memory                   (Leaflet + vanilla JS)

Browser  --GET /api/journeys-->  Express backend
(on Find Buses press)             matches routes, calculates ETAs,
                                  returns journey list
```

1. The **backend** loads `data/cities.json` at startup, reads each city's stop file and route file,
   and auto-generates a return route for every forward route.
2. The **simulator** moves buses along predefined stop sequences, bounces at each terminus, and
   POSTs position updates (including `cityId`) to `POST /api/update`.
3. The **frontend** calls `GET /api/stops` to populate the comboboxes when a city is selected.
4. On **Find Buses**, the frontend calls `GET /api/journeys`; the backend returns all direct routes
   connecting the two stops, with any currently active buses and their ETAs.
5. Live `locationUpdate` events arrive via Socket.IO and move bus markers — but only for routes
   returned by the last journey search.

---

## Project Structure

```
.
├── data/
│   ├── cities.json              # City registry (id, mapCenter, routeDataFile, stopsDataFile …)
│   ├── chennai-stops.json       # 17 canonical Chennai stops (CHE-STOP-* IDs)
│   ├── chennai-routes.json      # 4 forward Chennai routes with stopIds + stops arrays
│   ├── mumbai-stops.json        # 15 canonical Mumbai stops  (MUM-STOP-* IDs)
│   ├── mumbai-routes.json       # 5 forward Mumbai routes
│   ├── delhi-stops.json         # 20 canonical Delhi stops   (DEL-STOP-* IDs)
│   └── delhi-routes.json        # 5 forward Delhi routes
├── backend/
│   ├── server.js                # Express + Socket.IO server; serves frontend/
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html               # Journey-search UI (city tabs, comboboxes, results)
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── main.js              # Combobox factory, search logic, Leaflet map, Socket.IO client
├── simulator/
│   ├── simulator.js             # Multi-city bus movement simulator
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

---

## How to Run

You need **two terminal windows**. The backend serves the frontend automatically.

### Terminal 1 — Backend

```bash
cd backend
npm install
node server.js
# Starts on http://localhost:3000
# Also serves frontend/index.html at http://localhost:3000/
```

### Terminal 2 — Simulator

```bash
cd simulator
npm install

# All three cities — 28 buses (default)
CITY=all node simulator.js

# Single city
CITY=chennai node simulator.js   #  8 buses
CITY=mumbai  node simulator.js   # 10 buses
CITY=delhi   node simulator.js   # 10 buses
```

### Browser

Open **http://localhost:3000/** — no separate file server needed.

> If the connection badge shows "Connecting", ensure the backend is running first.

---

## Data Schemas

### City config — `data/cities.json`

```json
{
  "id":            "chennai",
  "name":          "Chennai",
  "label":         "Chennai Transit Live",
  "mapCenter":     [13.0827, 80.2707],
  "defaultZoom":   12,
  "routeDataFile": "chennai-routes.json",
  "stopsDataFile": "chennai-stops.json",
  "referenceStop": {
    "name": "Chennai Central",
    "lat":  13.0827,
    "lon":  80.2707
  }
}
```

### Canonical stop — `data/{city}-stops.json`

```json
{
  "stopId": "CHE-STOP-CENTRAL",
  "cityId": "chennai",
  "name":   "Chennai Central",
  "lat":    13.0827,
  "lon":    80.2707
}
```

Stop IDs follow the pattern `{PREFIX}-STOP-{NAME}`:
`CHE-STOP-*` for Chennai, `MUM-STOP-*` for Mumbai, `DEL-STOP-*` for Delhi.

### Forward route — `data/{city}-routes.json`

```json
{
  "routeId":     "CHN-01",
  "cityId":      "chennai",
  "routeName":   "Central Connect",
  "routeNumber": "12C",
  "direction":   "outbound",
  "color":       "#e53935",
  "stopIds": [
    "CHE-STOP-CENTRAL",
    "CHE-STOP-EGMORE",
    "CHE-STOP-KILPAUK",
    "CHE-STOP-ANNA-NAGAR",
    "CHE-STOP-KOYAMBEDU"
  ],
  "stops": [
    { "stopId": "CHN01-01", "name": "Chennai Central", "lat": 13.0827, "lon": 80.2707 },
    { "stopId": "CHN01-02", "name": "Egmore",          "lat": 13.0784, "lon": 80.2618 }
  ]
}
```

- **`stopIds`** — ordered array of canonical stop IDs used for journey matching.
- **`stops`** — route-scoped stop objects with coordinates; used by the simulator and for map polylines.

The backend auto-generates a return route at startup for each forward route by reversing both arrays.
Return routes have `routeId` suffixed with `R` (e.g. `CHN-01R`) and `direction: "return"`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server status: total active buses, per-city counts, uptime |
| GET | `/api/cities` | All city configs |
| GET | `/api/stops?cityId=<id>` | Canonical stops for a city |
| GET | `/api/stops?cityId=<id>&search=<q>` | Stops filtered by name (case-insensitive contains) |
| GET | `/api/routes?cityId=<id>` | Forward routes only (no auto-generated return routes) |
| GET | `/api/locations?cityId=<id>` | Current in-memory bus positions for a city |
| GET | `/api/locations?cityId=<id>&routeIds=R1,R2` | Positions filtered to specified route IDs |
| GET | `/api/journeys?cityId=<id>&fromStopId=<id>&toStopId=<id>` | Journey search (see below) |
| POST | `/api/update` | Receive a bus position from the simulator |

### GET `/api/journeys` — response shape

```json
{
  "cityId":   "chennai",
  "fromStop": { "stopId": "CHE-STOP-ADYAR", "name": "Adyar", "lat": 13.0012, "lon": 80.2565 },
  "toStop":   { "stopId": "CHE-STOP-THIRUVANMIYUR", "name": "Thiruvanmiyur", ... },
  "journeys": [
    {
      "routeId":              "CHN-03",
      "routeNumber":          "70M",
      "routeName":            "Airport Express Demo",
      "direction":            "outbound",
      "color":                "#00897b",
      "boardingStopIndex":    4,
      "destinationStopIndex": 5,
      "intermediateStopCount": 0,
      "intermediateStops":    [],
      "routeSegmentStops":    [ ...stop objects for this segment... ],
      "activeBuses": [
        {
          "busId":          "CHE-106",
          "lat":            13.0012,
          "lon":            80.2565,
          "nextStop":       "Thiruvanmiyur",
          "speedKmph":      25,
          "occupancyLevel": "Low",
          "timestamp":      "2026-07-11T14:09:05.123Z",
          "etaMinutes":     0,
          "etaLabel":       "Arriving soon"
        }
      ]
    }
  ]
}
```

Journeys are sorted: most active buses first, then fewest intermediate stops.
Active buses within a journey are sorted by ascending ETA (buses with unknown positions last).

`etaLabel` values: `"Arriving soon"`, `"~N min (approx, simulated)"`, or `"ETA unavailable"`.

### POST `/api/update` — request body

```json
{
  "cityId":         "mumbai",
  "busId":          "MUM-101",
  "lat":            19.0190,
  "lon":            72.8420,
  "routeId":        "MUM-R1",
  "speedKmph":      32,
  "nextStop":       "Bandra",
  "occupancyLevel": "Medium"
}
```

`routeId`, `speedKmph`, `nextStop`, and `occupancyLevel` are optional.
Returns `400` when `cityId` is missing/unsupported, `busId` is empty, `lat`/`lon` are not finite numbers,
or `routeId` is provided but not known for that city.

---

## Socket.IO Events

| Direction       | Event              | Payload                    | Description |
|-----------------|--------------------|----------------------------|-------------|
| Client → Server | `joinCity`         | `{ cityId: "mumbai" }`     | Join a city room; server immediately sends `initialLocations` |
| Client → Server | `leaveCity`        | `{ cityId: "chennai" }`    | Leave a city room before switching |
| Server → Client | `initialLocations` | Array of location objects  | All current bus positions for the city, sent on `joinCity` |
| Server → Client | `locationUpdate`   | Single location object     | Live position update; broadcast to city room only |
| Server → Client | `serverError`      | `{ message: "..." }`       | Sent when `joinCity` receives an unknown `cityId` |

City rooms are named `city:chennai`, `city:mumbai`, `city:delhi`.

---

## Example Journey Searches

Use these stop ID pairs to test the journey search — paste into `curl` or open the URL in a browser after starting the backend.

### Chennai

| Scenario | From stop ID | To stop ID | Expected routes |
|---|---|---|---|
| Single route | `CHE-STOP-CENTRAL` | `CHE-STOP-KOYAMBEDU` | CHN-01 |
| Multi-route | `CHE-STOP-ADYAR` | `CHE-STOP-THIRUVANMIYUR` | CHN-03, CHN-04 |
| Return direction | `CHE-STOP-THIRUVANMIYUR` | `CHE-STOP-ADYAR` | CHN-03R, CHN-04R |
| No direct route | `CHE-STOP-VELACHERY` | `CHE-STOP-MARINA-BEACH` | *(empty)* |

### Mumbai

| Scenario | From stop ID | To stop ID | Expected routes |
|---|---|---|---|
| Single route | `MUM-STOP-CSMT` | `MUM-STOP-THANE` | MUM-R2 |
| Multi-route | `MUM-STOP-BANDRA` | `MUM-STOP-CHEMBUR` | MUM-R4, MUM-R5 |
| Return direction | `MUM-STOP-BORIVALI` | `MUM-STOP-CSMT` | MUM-R1R |
| No direct route | `MUM-STOP-VASHI` | `MUM-STOP-ANDHERI` | *(empty)* |

### Delhi

| Scenario | From stop ID | To stop ID | Expected routes |
|---|---|---|---|
| Single route | `DEL-STOP-DWARKA` | `DEL-STOP-NOIDA-18` | DEL-R2 |
| Multi-route | `DEL-STOP-ISBT` | `DEL-STOP-RAJIV-CHOWK` | DEL-R1, DEL-R5 |
| Return direction | `DEL-STOP-RAJIV-CHOWK` | `DEL-STOP-ISBT` | DEL-R1R, DEL-R5R |
| No direct route | `DEL-STOP-SAFDURJUNG` | `DEL-STOP-CHANDNI` | *(empty)* |

**curl example:**

```bash
curl "http://localhost:3000/api/journeys?cityId=chennai&fromStopId=CHE-STOP-ADYAR&toStopId=CHE-STOP-THIRUVANMIYUR"
```

---

## Simulated Routes

### Chennai (4 routes, 17 stops)

| Route ID | Number | Route Name           | Corridor |
|----------|--------|----------------------|----------|
| CHN-01   | 12C    | Central Connect      | Chennai Central → Egmore → Kilpauk → Anna Nagar → Koyambedu |
| CHN-02   | 21     | IT Corridor Link     | Koyambedu → Ashok Nagar → T Nagar → Saidapet → Guindy → Velachery |
| CHN-03   | 70M    | Airport Express Demo | Chennai Airport → St. Thomas Mount → Guindy → Saidapet → Adyar → Thiruvanmiyur |
| CHN-04   | 5C     | Marina Loop          | Chennai Central → Triplicane → Light House → Marina Beach → Adyar → Thiruvanmiyur |

### Mumbai (5 routes, 15 stops)

| Route ID | Number   | Route Name        | Corridor |
|----------|----------|-------------------|----------|
| MUM-R1   | 201 Ltd  | Western Corridor  | CSMT → Dadar → Bandra → Andheri → Borivali |
| MUM-R2   | 302      | Eastern Link      | CSMT → Kurla → Ghatkopar → Mulund → Thane |
| MUM-R3   | 504      | Harbour Route     | CSMT → Wadala → Chembur → Vashi → Belapur |
| MUM-R4   | A1 Ltd   | BKC Connect       | Bandra → BKC → Kurla → Sion → Chembur |
| MUM-R5   | 302 Exp  | Suburban Express  | Dadar → Bandra → Kurla → Chembur |

### Delhi (5 routes, 20 stops)

| Route ID | Number     | Route Name          | Corridor |
|----------|------------|---------------------|----------|
| DEL-R1   | DL-101     | Yellow Line Connect | ISBT → Kashmere Gate → Chandni Chowk → Rajiv Chowk → Central Secretariat → AIIMS |
| DEL-R2   | DL-502     | Blue Line Express   | Dwarka → Janakpuri → Rajouri Garden → Rajiv Chowk → Mandi House → Noida Sector 18 |
| DEL-R3   | DL-201     | Red Fort Loop       | ISBT → Red Fort → New Delhi Railway → Connaught Place → Karol Bagh |
| DEL-R4   | DL-Airport | Airport Express     | Mahipalpur → Aerocity → Dhaula Kuan → RK Puram → Safdurjung |
| DEL-R5   | DL-103     | Heritage Connect    | ISBT → Chandni Chowk → Rajiv Chowk → Mandi House |

---

## Current Limitations

- **Direct routes only** — no transfer routing. If no single route connects the two stops, the result is empty.
- **In-memory vehicle state** — bus positions are lost when the backend restarts. There is no database.
- **No real-time feeds** — all vehicle positions are produced by the simulator. No GTFS-Realtime or official agency API is connected.
- **Simulated coordinates** — stop coordinates are approximate landmark positions, not surveyed stop locations.
- **ETA is approximate** — calculated from Haversine distance and reported speed; traffic, dwell time, and signal delays are not modelled.

---

## Planned Roadmap

- [ ] GTFS static feed import — replace hand-authored JSON with real schedule data
- [ ] GTFS-Realtime adapter — plug in live vehicle positions when an agency API is available
- [ ] Transfer routing — find journeys that require one change
- [ ] Persistent vehicle state — store positions in Redis or SQLite so restarts do not lose data
- [ ] Stop arrival predictions — use historical dwell and travel times
- [ ] Admin endpoint with authentication for bus update ingestion
- [ ] Docker deployment configuration

---

## Adding a City

1. **Add a city entry** to `data/cities.json` following the schema above. Set `routeDataFile` and `stopsDataFile`.

2. **Create a stop file** `data/<city>-stops.json` with a `stops` array. Give each stop a city-prefixed canonical ID (e.g. `HYD-STOP-*`).

3. **Create a route file** `data/<city>-routes.json`. Every route needs:
   - a `stopIds` array referencing the canonical stop IDs (in boarding order)
   - a `stops` array with coordinates (used by the simulator and for map polylines)

4. **No code changes needed** — the backend loads all cities from `cities.json` at startup; the simulator
   includes any new city when `CITY=all`; the frontend generates city tabs dynamically from `/api/cities`.

---

## Configuration

### Backend — `backend/.env`

```
PORT=3000
```

### Simulator — `simulator/.env`

```
BACKEND_URL=http://localhost:3000/api/update
CITY=all
```

Copy `*.env.example` to `*.env` and adjust as needed. Both `PORT` and `BACKEND_URL` can also be
set as shell environment variables.

---

## Troubleshooting

**Connection badge stays "Connecting"**
- Ensure the backend is running: `cd backend && node server.js`
- The frontend expects the backend at `http://localhost:3000`. If you changed the port, update
  `BACKEND_URL` in `frontend/js/main.js` to match.

**Stops combobox is empty after selecting a city**
- The frontend fetches stops from `/api/stops?cityId=<id>` on city switch. Check the backend terminal
  for errors and verify that the city's `stopsDataFile` exists in `data/`.

**No buses appear after searching**
- Start the simulator: `CITY=all node simulator.js` from the `simulator/` directory.
- Bus markers only appear for routes returned by the current search. If no routes matched, no markers appear.

**"No direct route found" when a route should exist**
- Confirm the stop IDs used are canonical `{PREFIX}-STOP-*` IDs (from `GET /api/stops`), not the
  route-scoped `CHN01-01` style IDs found in the route `stops` array.
- A route only matches if `indexOf(fromStopId) < indexOf(toStopId)` in `stopIds`. Try swapping
  origin and destination to search the return direction.

**Simulator exits immediately**
- Check that `data/cities.json` and all referenced route files exist and contain valid JSON.
- Pass `CITY=chennai` to isolate a single city if `CITY=all` fails.

**Backend fails to start**
- Run `npm install` inside `backend/`.
- Verify all JSON files in `data/` parse cleanly: `node -e "require('./data/cities.json')"`.

---

## Data Disclaimer

All route, stop, and vehicle data in this project is **simulated for educational and portfolio
demonstration only**. Stop coordinates are approximate landmark positions. ETAs are illustrative only.
This project is **not affiliated with MTC, BEST, DTC, DMRC, MMRDA, CUMTA, or any other official
transport authority**. Do not use this application for actual transport planning or navigation.
