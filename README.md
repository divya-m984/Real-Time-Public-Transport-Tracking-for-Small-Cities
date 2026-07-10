# Chennai Transit Live

> A simulated real-time public transport tracking dashboard for Chennai city.
> Built as a student/portfolio project using Node.js, Socket.IO, and Leaflet.js.

**This project uses simulated Chennai route data for demonstration purposes. It is not affiliated with MTC (Metropolitan Transport Corporation) or CUMTA.**

---

## Features

- Real-time bus position updates via WebSocket (Socket.IO)
- Interactive Leaflet.js map centred on Chennai
- 8 simulated buses across 4 Chennai route corridors
- Live sidebar cards showing speed, next stop, occupancy, and ETA to Chennai Central
- Route filter buttons (CHN-01 through CHN-04)
- Haversine-based ETA calculation using actual bus speed (fallback: 28 km/h)
- Occupancy indicator: Low / Medium / High
- Connection status pill and offline/reconnecting banner
- `/api/routes` and `/api/stops` endpoints for future GTFS integration
- No build step required — plain HTML/CSS/JS frontend

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
Simulator  --POST /api/update-->  Backend  --Socket.IO-->  Frontend (browser)
(every 2-4s)                      (validates + stores)     (map + sidebar)
```

1. The **simulator** moves 8 buses along predefined Chennai corridor stops and POSTs each position to the backend.
2. The **backend** validates, stores in memory, and broadcasts a `locationUpdate` Socket.IO event to all connected browsers.
3. The **frontend** receives events and moves map markers, updating the sidebar card with speed, next stop, occupancy, and ETA.
4. When a new browser tab connects, the backend sends all current positions via `initialLocations` so the map loads instantly.

---

## Folder Structure

```
.
├── data/
│   └── chennai-routes.json     # Simulated Chennai route/stop definitions
├── backend/
│   ├── server.js               # Express + Socket.IO server
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html              # Dashboard UI
│   ├── css/
│   │   └── style.css           # Dark dashboard styles
│   └── js/
│       └── main.js             # Map logic, Socket.IO client, ETA engine
├── simulator/
│   ├── simulator.js            # Chennai bus movement simulator
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
node simulator.js
# Sends bus updates to the backend every 2-4 seconds
```

### Terminal 3 — Frontend

Open `frontend/index.html` directly in your browser. No build step needed.

> If the connection badge shows "Connecting", make sure the backend is running first.

---

## API Endpoints

| Method | Endpoint          | Description                                      |
|--------|-------------------|--------------------------------------------------|
| GET    | `/health`         | Server health check (buses, routes, uptime)      |
| GET    | `/api/routes`     | All Chennai route definitions with stops         |
| GET    | `/api/stops`      | Flat list of all stops with routeId              |
| GET    | `/api/locations`  | Current live positions of all active buses       |
| POST   | `/api/update`     | Receive a bus location update from the simulator |

### POST `/api/update` — Request body

```json
{
  "busId":          "MTC-1A",
  "lat":            13.0827,
  "lon":            80.2707,
  "routeId":        "CHN-01",
  "speedKmph":      32,
  "nextStop":       "Egmore",
  "occupancyLevel": "Medium"
}
```

**Validation:**
- `busId` — required, non-empty string
- `lat` / `lon` — required, finite numbers
- `routeId` — optional; if provided, must exist in `data/chennai-routes.json`
- `speedKmph`, `nextStop`, `occupancyLevel` — optional

---

## Simulated Routes

| Route ID | Route Name           | Corridor                                                     |
|----------|----------------------|--------------------------------------------------------------|
| CHN-01   | Central Connect      | Chennai Central → Egmore → Kilpauk → Anna Nagar → Koyambedu |
| CHN-02   | IT Corridor Link     | Koyambedu → Ashok Nagar → T Nagar → Saidapet → Guindy → Velachery |
| CHN-03   | Airport Express Demo | Chennai Airport → St. Thomas Mount → Guindy → Saidapet → Adyar → Thiruvanmiyur |
| CHN-04   | Marina Loop          | Chennai Central → Triplicane → Light House → Marina Beach → Adyar → Thiruvanmiyur |

---

## Configuration

### Backend — `backend/.env`

```
PORT=3000
```

Copy `backend/.env.example` to `backend/.env` and adjust as needed.

### Simulator — `simulator/.env`

```
BACKEND_URL=http://localhost:3000/api/update
```

Copy `simulator/.env.example` to `simulator/.env` and adjust as needed.

---

## Data Disclaimer

This project uses **simulated Chennai route data** for educational and portfolio demonstration.
Stop coordinates are approximate landmark positions.
It is **not affiliated with MTC (Metropolitan Transport Corporation), CUMTA, or any official transport authority**.
Do not rely on this for actual transport planning or navigation.

---

## Future Roadmap

- [ ] GTFS static feed import (replace simulated JSON with real schedule data)
- [ ] GTFS-Realtime adapter (plug in live vehicle positions when an API is available)
- [ ] Route polyline overlays on the map
- [ ] Stop-based arrival predictions
- [ ] Route search and journey planner
- [ ] Admin dashboard with update authentication
- [ ] Historical trip playback
- [ ] Mobile-first PWA with offline support
- [ ] Docker deployment configuration
