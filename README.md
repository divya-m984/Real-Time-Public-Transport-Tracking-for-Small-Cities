# Transit Live India

> A simulated real-time public transport tracking dashboard for Chennai, Mumbai, and Delhi.
> Built as a student/portfolio project using Node.js, Socket.IO, and Leaflet.js.

**All route and location data is simulated for educational and portfolio demonstration only.
This project is not affiliated with any official transport authority (MTC, BEST, DTC, DMRC, MMRDA, or CUMTA).**

---

## Features

- City selector for Chennai, Mumbai, and Delhi — each city is a fully independent view
- Real-time bus position updates via WebSocket (Socket.IO) with city-scoped rooms
- Interactive Leaflet.js map that re-centres on the selected city
- 8 simulated buses per city (2 per route, 4 routes each — 24 buses total when `CITY=all`)
- Live sidebar cards showing speed, next stop, occupancy, and ETA to city centre
- Route filter buttons (per-city, dynamically generated)
- Haversine-based ETA calculation using actual bus speed (fallback: 28 km/h)
- Occupancy indicator: Low / Medium / High
- Connection status pill and offline/reconnecting banner
- City selection persisted to `localStorage` (falls back to Chennai safely)
- No build step — plain HTML/CSS/JS frontend

---

## Supported Cities

| City    | Map Centre            | Routes            | Buses      |
|---------|-----------------------|-------------------|------------|
| Chennai | 13.0827, 80.2707      | CHN-01 to CHN-04  | CHE-101..108 |
| Mumbai  | 19.0760, 72.8777      | MUM-R1 to MUM-R4  | MUM-101..108 |
| Delhi   | 28.6139, 77.2090      | DEL-R1 to DEL-R4  | DEL-101..108 |

---

## Tech Stack

| Layer     | Technology                      |
|-----------|---------------------------------|
| Backend   | Node.js, Express 4, Socket.IO 4 |
| Frontend  | HTML5, CSS3, Vanilla JavaScript |
| Map       | Leaflet.js (via CDN)            |
| Simulator | Node.js, Axios                  |
| Data      | Simulated GTFS-style JSON       |

---

## Architecture

```
Simulator  --POST /api/update-->  Backend  --Socket.IO rooms-->  Frontend (browser)
(every 2-4s)                      (validates + stores            (map + sidebar for
                                   per city)                      selected city only)
```

1. The **simulator** moves buses along predefined stop sequences and POSTs each position (including `cityId`) to the backend.
2. The **backend** validates the update, stores it in a per-city in-memory map, and broadcasts `locationUpdate` only to the matching Socket.IO city room (`city:chennai`, `city:mumbai`, `city:delhi`).
3. The **frontend** sends a `joinCity` event when the user selects a city; the server responds with `initialLocations` for that city and adds the socket to the room.
4. When the user switches cities, the frontend emits `leaveCity` (old) and `joinCity` (new), clears all map markers and sidebar cards, and renders fresh data for the new city.

---

## Project Structure

```
.
├── data/
│   ├── cities.json              # City configs (mapCenter, zoom, referenceStop, routeDataFile)
│   ├── chennai-routes.json      # Simulated Chennai routes (4 routes, 5-6 stops each)
│   ├── mumbai-routes.json       # Simulated Mumbai routes  (4 routes, 5 stops each)
│   └── delhi-routes.json        # Simulated Delhi routes   (4 routes, 5-6 stops each)
├── backend/
│   ├── server.js                # Express + Socket.IO server (multi-city)
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html               # Dashboard UI with city selector
│   ├── css/
│   │   └── style.css            # Dark dashboard styles + city tab styles
│   └── js/
│       └── main.js              # Map logic, city switching, Socket.IO client
├── simulator/
│   ├── simulator.js             # Multi-city bus movement simulator
│   ├── package.json
│   └── .env.example
├── .gitignore
└── README.md
```

---

## How to Run

You need **three terminal windows**.

### Terminal 1 — Backend

```bash
cd backend
npm install
node server.js
# Server starts on http://localhost:3000
```

### Terminal 2 — Simulator

```bash
cd simulator
npm install

# All three cities (default)
CITY=all node simulator.js

# Single city
CITY=chennai node simulator.js
CITY=mumbai  node simulator.js
CITY=delhi   node simulator.js
```

`CITY=all` starts 24 buses (8 per city). The simulator loads `data/cities.json` to discover which route files to read, then builds 2 buses per route using city-prefixed IDs (`CHE-`, `MUM-`, `DEL-`). Each bus update includes a `cityId` field so the backend can route it to the correct city group.

### Terminal 3 — Frontend

Open `frontend/index.html` directly in your browser. No build step needed.

> If the connection badge shows "Connecting", make sure the backend is running first.

---

## City Configuration Schema

Each city entry in `data/cities.json`:

```json
{
  "id":            "chennai",
  "name":          "Chennai",
  "label":         "Chennai Transit Live",
  "mapCenter":     [13.0827, 80.2707],
  "defaultZoom":   12,
  "routeDataFile": "chennai-routes.json",
  "referenceStop": {
    "name": "Chennai Central",
    "lat":  13.0827,
    "lon":  80.2707
  }
}
```

## Route File Schema

Each city route file (`*-routes.json`):

```json
{
  "_disclaimer": "DEMO DATA ONLY — …",
  "cityId": "chennai",
  "routes": [
    {
      "routeId":   "CHN-01",
      "cityId":    "chennai",
      "routeName": "Central Connect",
      "color":     "#e53935",
      "stops": [
        { "stopId": "CHN01-01", "name": "Chennai Central", "lat": 13.0827, "lon": 80.2707 }
      ]
    }
  ]
}
```

---

## API Endpoints

| Method | Endpoint                        | Description                                        |
|--------|---------------------------------|----------------------------------------------------|
| GET    | `/health`                       | Server health (total buses, per-city counts, uptime) |
| GET    | `/api/cities`                   | All city configs (id, name, mapCenter, etc.)       |
| GET    | `/api/routes?cityId=<id>`       | Route definitions with stops for a city            |
| GET    | `/api/stops?cityId=<id>`        | Flat stop list with routeId for a city             |
| GET    | `/api/locations?cityId=<id>`    | Current live positions of all active buses for a city |
| POST   | `/api/update`                   | Receive a bus location update from the simulator   |

### POST `/api/update` — Request body

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

**Validation — returns 400 when:**
- `cityId` is missing, empty, or not a supported city
- `busId` is missing or empty
- `lat` or `lon` is missing or not a finite number
- `routeId` is provided but not known for that city

---

## Socket.IO Events

| Direction       | Event             | Payload                           | Description                                      |
|-----------------|-------------------|-----------------------------------|--------------------------------------------------|
| Client → Server | `joinCity`        | `{ cityId: "mumbai" }`            | Join a city room; server replies with initial data |
| Client → Server | `leaveCity`       | `{ cityId: "chennai" }`           | Leave a city room before switching                |
| Server → Client | `initialLocations`| Array of location objects         | Sent on `joinCity`; all current buses for the city |
| Server → Client | `locationUpdate`  | Single location object            | Live position update; sent only to city room      |
| Server → Client | `serverError`     | `{ message: "..." }`              | Sent when `joinCity` receives an invalid cityId   |

---

## Simulated Routes

### Chennai

| Route ID | Route Name           | Corridor                                                                  |
|----------|----------------------|---------------------------------------------------------------------------|
| CHN-01   | Central Connect      | Chennai Central → Egmore → Kilpauk → Anna Nagar → Koyambedu               |
| CHN-02   | IT Corridor Link     | Koyambedu → Ashok Nagar → T Nagar → Saidapet → Guindy → Velachery         |
| CHN-03   | Airport Express Demo | Chennai Airport → St. Thomas Mount → Guindy → Saidapet → Adyar → Thiruvanmiyur |
| CHN-04   | Marina Loop          | Chennai Central → Triplicane → Light House → Marina Beach → Adyar → Thiruvanmiyur |

### Mumbai

| Route ID | Route Name       | Corridor                                            |
|----------|------------------|-----------------------------------------------------|
| MUM-R1   | Western Corridor | CSMT → Dadar → Bandra → Andheri → Borivali          |
| MUM-R2   | Eastern Link     | CSMT → Kurla → Ghatkopar → Mulund → Thane           |
| MUM-R3   | Harbour Route    | CSMT → Wadala → Chembur → Vashi → Belapur           |
| MUM-R4   | BKC Connect      | Bandra → BKC → Kurla → Sion → Chembur               |

### Delhi

| Route ID | Route Name          | Corridor                                                              |
|----------|---------------------|-----------------------------------------------------------------------|
| DEL-R1   | Yellow Line Connect | ISBT → Kashmere Gate → Chandni Chowk → Rajiv Chowk → Central Secretariat → AIIMS |
| DEL-R2   | Blue Line Express   | Dwarka → Janakpuri → Rajouri Garden → Rajiv Chowk → Mandi House → Noida Sector 18 |
| DEL-R3   | Red Fort Loop       | ISBT → Red Fort → New Delhi Railway → Connaught Place → Karol Bagh  |
| DEL-R4   | Airport Express     | Mahipalpur → Aerocity → Dhaula Kuan → RK Puram → Safdurjung         |

---

## Adding a Fourth City

1. **Add a city entry** to `data/cities.json` following the schema above.

2. **Create a route file** `data/<cityname>-routes.json` with the same schema as the existing files. Set `cityId` on every route.

3. **Backend** — no code changes required; the server loads all cities from `cities.json` at startup.

4. **Simulator** — no code changes required; `CITY=all` will automatically include the new city.

5. **Frontend** — no code changes required; city tabs are generated dynamically from `/api/cities`.

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

Copy `*.env.example` to `*.env` and adjust as needed.

---

## Data Disclaimer

All route and location data in this project is **simulated for educational and portfolio demonstration**.
Stop coordinates are approximate landmark positions.
This project is **not affiliated with MTC, BEST, DTC, DMRC, MMRDA, CUMTA, or any other official transport authority**.
Do not use this application for actual transport planning or navigation.

---

## Troubleshooting

**Connection badge stays "Connecting"**
- Ensure the backend is running: `cd backend && node server.js`
- Check the browser console for CORS or connection errors.
- The default backend URL is `http://localhost:3000`. If you changed the port, update `BACKEND_URL` in `frontend/js/main.js`.

**No buses appear after switching city**
- Make sure the simulator is running with `CITY=all` (or the specific city).
- Check the backend terminal for `POST /api/update` log lines.
- Open the browser console; `processUpdate` logs discarded cityId mismatches.

**Simulator exits immediately**
- Check that `data/cities.json` exists and is valid JSON.
- Verify that the route file referenced by `routeDataFile` exists in `data/`.

**Backend fails to start**
- Run `npm install` inside the `backend/` directory.
- Check that all four JSON files in `data/` are valid (no trailing commas, correct UTF-8).

---

## Future Roadmap

- [ ] GTFS static feed import (replace simulated JSON with real schedule data)
- [ ] GTFS-Realtime adapter (plug in live vehicle positions when an API is available)
- [ ] Route polyline overlays on the map
- [ ] Stop markers with arrival predictions
- [ ] Journey planner across city routes
- [ ] Admin dashboard with update authentication
- [ ] Historical trip playback
- [ ] Docker deployment configuration
