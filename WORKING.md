# Real-Time Public Transport Tracking - How It Works

This document explains the architecture and data flow of the Real-Time Public Transport Tracking application.

## System Architecture

The application is composed of three main components that work together:

1.  **Backend**: A Node.js server that acts as the central hub. It receives location data from buses, stores it, and broadcasts it to all connected clients in real-time.
2.  **Frontend**: A web-based user interface that displays a map with the live locations of buses. It connects to the backend to receive location updates.
3.  **Bus Simulator**: A script that mimics real buses by sending periodic location updates to the backend. This is used for development and demonstration purposes.

---

## Component Breakdown

### 1. Backend (`/backend`)

The backend is the core of the system, responsible for managing and distributing data.

-   **Technology**: Node.js, Express.js, and Socket.IO.
-   **File**: `server.js`

#### Workflow:

1.  **Initialization**: The server starts and listens for HTTP and WebSocket connections on a specified port (e.g., 3000).
2.  **Receiving Data**: It exposes an HTTP endpoint `/api/update`. The Bus Simulator (or a real GPS device) sends a `POST` request to this endpoint with the bus's ID, latitude, and longitude.
3.  **Storing Data**: The server stores the latest location of each bus in an in-memory object (`busLocations`). This provides a quick way to retrieve the current state.
4.  **Broadcasting Updates**: Upon receiving a new location, the server immediately uses Socket.IO to broadcast a `locationUpdate` event to all connected frontend clients. This event contains the updated location data for the specific bus.
5.  **New Client Connection**: When a new user opens the web app, their browser connects to the backend via Socket.IO. The server detects this new connection and sends a `initialLocations` event, which contains the current locations of *all* buses, so the map can be populated immediately.

### 2. Bus Simulator (`/simulator`)

The simulator's job is to generate realistic, moving data points for the buses.

-   **Technology**: Node.js and Axios.
-   **File**: `simulator.js`

#### Workflow:

1.  **Predefined Routes**: The script contains hardcoded routes (a series of coordinates) for one or more buses.
2.  **Periodic Updates**: Using `setInterval`, the simulator cycles through the coordinates for each bus.
3.  **Sending Data**: Every few seconds, it sends an HTTP `POST` request to the backend's `/api/update` endpoint, reporting the bus's new "location". This mimics a real GPS device sending data.

### 3. Frontend (`/frontend`)

The frontend is what the end-user sees and interacts with. It provides a visual representation of the bus locations.

-   **Technology**: HTML, CSS, JavaScript, Leaflet.js (for maps), and Socket.IO client.
-   **Files**: `index.html`, `css/style.css`, `js/main.js`

#### Workflow:

1.  **Page Load**: When a user opens `index.html`, the browser loads the page structure, styles, and the main JavaScript file (`js/main.js`).
2.  **Map Initialization**: `main.js` initializes a map using the Leaflet.js library and centers it on a default location.
3.  **WebSocket Connection**: The script immediately establishes a WebSocket connection to the backend server using Socket.IO.
4.  **Receiving Initial Data**: Once connected, the frontend listens for the `initialLocations` event from the server. When this event is received, the script iterates through the list of buses and places a marker for each one on the map.
5.  **Receiving Real-Time Updates**: The frontend also listens for the `locationUpdate` event. Whenever this event is received, the script finds the corresponding bus marker on the map and updates its position to the new coordinates. If the bus is new, it creates a new marker.
6.  **UI Updates**: The bus list on the side of the map is also updated with the latest coordinates, providing a textual representation of the bus status.

---

## Where the Bus ID Comes From

The `busId` is a unique identifier for each bus. Its journey through the system is as follows:

1.  **Origination (in the Simulator)**: The `busId` (e.g., `'Bus-01'`) is first defined in the `simulator/simulator.js` file. It is used as a key in the `routes` object to associate a bus with its path.

2.  **Transmission to Backend**: When the simulator sends a location update, it includes the `busId` in the JSON payload of the HTTP `POST` request to the backend's `/api/update` endpoint.
    ```javascript
    // From simulator.js
    await axios.post(BACKEND_URL, { busId, lat, lon });
    ```

3.  **Processing by Backend**: The backend server (`server.js`) receives this request, extracts the `busId` from the request body, and uses it as a key to store or update the bus's location in the `busLocations` object.
    ```javascript
    // From server.js
    const { busId, lat, lon } = req.body;
    busLocations[busId] = locationData;
    ```

4.  **Broadcasting to Frontend**: The backend then includes the `busId` in the data packet that it broadcasts to all connected frontend clients via Socket.IO.

5.  **Usage in Frontend**: The frontend (`js/main.js`) receives the data packet, reads the `busId`, and uses it to:
    -   Identify the correct map marker to create or update (`busMarkers[busId]`).
    -   Identify the correct list item in the bus status panel to update.

In a real-world application, each physical GPS unit installed on a bus would be configured with a unique ID, which would replace the hardcoded ID from the simulator.

## Data Flow Summary

The end-to-end data flow is as follows:

1.  **Simulator** `(sends HTTP POST)` -> **Backend** (`/api/update`)
2.  **Backend** `(stores location)` -> **Backend** `(broadcasts 'locationUpdate' via WebSocket)`
3.  **Frontend** `(receives 'locationUpdate')` -> **User's Map** `(marker moves)`

This architecture ensures that the data is transmitted efficiently and with low latency, which is crucial for a real-time tracking application. The use of WebSockets minimizes the need for the client to repeatedly ask the server for updates (polling), making the system scalable and optimized for low-bandwidth environments.
