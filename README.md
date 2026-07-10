# Real-Time Public Transport Tracking for Small Cities

A full-stack demo application that shows live bus positions on an interactive map using WebSockets. Built with Node.js, Socket.IO, and Leaflet.js — designed as a learning project for small-city public transport scenarios.

> **Note:** This is a simulation using the fictional city of **Maplewood**. It is intended for educational and demonstration purposes and is not production-ready.

---

## Features

- Real-time bus location updates via WebSocket (Socket.IO)
- Interactive Leaflet.js map with color-coded route markers
- Live sidebar with ETA, distance, and current stop per bus
- 4 simulated buses across 2 routes in Maplewood City
- Input validation on the backend (`busId`, `lat`, `lon`)
- `/health` endpoint for quick server status checks
- Responsive dashboard — works on desktop and mobile
- No build step required — plain HTML/CSS/JS frontend

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Backend   | Node.js, Express 4, Socket.IO 4     |
| Frontend  | HTML5, CSS3, Vanilla JavaScript     |
| Map       | Leaflet.js (via CDN)                |
| Simulator | Node.js, Axios                      |

---

## Project Structure

```
.
├── backend/
│   ├── server.js          # Express + Socket.IO server
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── frontend/
│   ├── index.html         # Dashboard UI
│   ├── css/
│   │   └── style.css      # Dashboard styles
│   └── js/
│       └── main.js        # Map logic, Socket.IO client
├── simulator/
│   ├── simulator.js       # Maplewood bus movement simulator
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
├── .gitignore
├── WORKING.md             # Architecture notes
└── README.md
```

---

## Quick Start

You need **three terminal windows**.

### 1. Start the backend

```bash
cd backend
npm install
node server.js
# Server starts on http://localhost:3000
```

### 2. Open the frontend

Open `frontend/index.html` directly in your browser. No build step needed.

> If you see a "Connecting" status, make sure the backend is running.

### 3. Start the simulator

```bash
cd simulator
npm install
node simulator.js
# Sends bus location updates to the backend every 3 seconds
```

Once all three are running, you should see buses moving on the map in real time.

---

## API Reference

| Method | Endpoint          | Description                           |
|--------|-------------------|---------------------------------------|
| GET    | `/health`         | Server health check                   |
| GET    | `/api/locations`  | Returns all current bus locations     |
| POST   | `/api/update`     | Accepts a bus location update         |

### POST `/api/update` — Request body

```json
{
  "busId":    "Bus-01",
  "lat":      18.5170,
  "lon":      73.8470,
  "route":    "Railway Station — North Market",
  "stopName": "Central Market"
}
```

**Validation rules:**
- `busId` — required, non-empty string
- `lat` / `lon` — required, finite numbers
- `route`, `stopName` — optional strings

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

## How It Works

```
Simulator  ──POST /api/update──>  Backend  ──Socket.IO──>  Frontend (browser)
(every 3s)                        (stores + broadcasts)     (updates map)
```

1. The **simulator** moves 4 buses along predefined stops and sends each position to the backend via HTTP POST.
2. The **backend** validates and stores the latest position in memory, then broadcasts a `locationUpdate` event over WebSocket to all connected browsers.
3. The **frontend** receives the event and moves the map marker to the new position, updating the sidebar card (ETA, distance, current stop).

When a new browser tab connects, the backend sends all current bus positions immediately via an `initialLocations` event so the map is populated at once.

---

## Simulated City: Maplewood

Maplewood is a fictional small city used for this demo. Two bus routes cover the city:

| Route   | Stops                                                                                    |
|---------|------------------------------------------------------------------------------------------|
| Route A | Railway Station → Nehru Chowk → Bus Stand → Town Hall → Central Market → City Square → College Road → Green Park → North Market |
| Route B | West Park → Hospital Road → Civil Lines → City Center → Post Office → IT Park → Lake View → East Gate |

---

## Limitations

- Bus data is stored **in memory only** — restarting the backend clears all positions.
- No authentication — anyone can POST fake bus updates.
- No real GPS integration — all data comes from the simulator.

## Future Improvements

- Persistent storage (Redis or PostgreSQL)
- Authentication for the `/api/update` endpoint (API key or JWT)
- Real GPS device integration
- Route polyline overlays on the map
- Historical trip playback
- Push notifications for bus arrivals
