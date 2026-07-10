// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = 'http://localhost:3000';

// Reference stop for ETA calculations (Maplewood Railway Station)
const REFERENCE_STOP = { lat: 18.5050, lon: 73.8450, name: 'Maplewood Railway Station' };

// Assumed average bus speed in km/h for ETA
const AVG_SPEED_KMH = 25;

// Route styling keyed by a substring of the route name
const ROUTE_STYLES = {
  'North Market': { color: '#2563eb', label: 'A' },
  'East Gate':    { color: '#0d9488', label: 'B' },
};

// ── Map setup ─────────────────────────────────────────────────────────────────
// Centre on Maplewood city area
const map = L.map('map').setView([18.517, 73.844], 14);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// Reference stop marker
L.marker([REFERENCE_STOP.lat, REFERENCE_STOP.lon], {
  icon: L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  }),
})
  .addTo(map)
  .bindPopup(`<b>Stop A</b><br>${REFERENCE_STOP.name}`);

// ── State ─────────────────────────────────────────────────────────────────────
const busMarkers = {};   // busId -> Leaflet marker
const busData    = {};   // busId -> latest data object

// ── DOM refs ──────────────────────────────────────────────────────────────────
const busList      = document.getElementById('bus-list');
const activeCount  = document.getElementById('active-count');
const offlineBanner = document.getElementById('offline-banner');
const connBadge    = document.getElementById('connection-badge');
const connDot      = document.getElementById('conn-dot');
const connText     = document.getElementById('conn-text');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRouteStyle(routeName) {
  if (!routeName) return { color: '#6b7280', label: '?' };
  for (const [key, style] of Object.entries(ROUTE_STYLES)) {
    if (routeName.includes(key)) return style;
  }
  return { color: '#6b7280', label: '?' };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEta(distKm) {
  const totalMins = Math.round((distKm / AVG_SPEED_KMH) * 60);
  if (totalMins < 1) return '< 1 min';
  if (totalMins < 60) return `${totalMins} min`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

// ── Map marker ────────────────────────────────────────────────────────────────

function createBusIcon(label, color) {
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker" style="background:${color};">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
}

function updateMapMarker(d) {
  const { busId, lat, lon, route, stopName } = d;
  const style = getRouteStyle(route);
  const latLng = [lat, lon];
  const popupHtml = `
    <b>${busId}</b><br>
    ${route || 'Unknown route'}<br>
    ${stopName ? `Stop: ${stopName}<br>` : ''}
    <small>(${lat.toFixed(4)}, ${lon.toFixed(4)})</small>
  `;

  if (busMarkers[busId]) {
    busMarkers[busId].setLatLng(latLng);
    busMarkers[busId].setIcon(createBusIcon(style.label, style.color));
    busMarkers[busId].getPopup().setContent(popupHtml);
  } else {
    busMarkers[busId] = L.marker(latLng, { icon: createBusIcon(style.label, style.color) })
      .addTo(map)
      .bindPopup(popupHtml);
  }
}

// ── Sidebar card ──────────────────────────────────────────────────────────────

function updateSidebarCard(d) {
  const { busId, lat, lon, route, stopName, timestamp } = d;
  const style = getRouteStyle(route);
  const distKm = haversineKm(lat, lon, REFERENCE_STOP.lat, REFERENCE_STOP.lon);
  const eta = formatEta(distKm);
  const ago = timeAgo(timestamp);

  let card = document.getElementById(`card-${busId}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `card-${busId}`;
    card.className = 'bus-card';
    busList.appendChild(card);
  }

  // Apply route colour class
  card.className = style.label === 'B' ? 'bus-card route-b' : 'bus-card';
  card.style.borderLeftColor = style.color;

  card.innerHTML = `
    <div class="card-header">
      <span class="card-bus-id">${busId}</span>
      <span class="live-badge">
        <span class="live-dot"></span>LIVE
      </span>
    </div>
    <p class="card-route">${route || 'Unknown route'}</p>
    ${stopName ? `<p class="card-stop">${stopName}</p>` : ''}
    <div class="card-stats">
      <div class="stat">
        <div class="stat-label">Distance</div>
        <div class="stat-value">${distKm.toFixed(1)} km</div>
      </div>
      <div class="stat">
        <div class="stat-label">ETA to Stop A</div>
        <div class="stat-value">${eta}</div>
      </div>
    </div>
    <p class="card-updated">Updated: ${ago}</p>
  `;
}

// ── Main update handler ───────────────────────────────────────────────────────

function processUpdate(d) {
  busData[d.busId] = d;
  updateMapMarker(d);
  updateSidebarCard(d);
  activeCount.textContent = `${Object.keys(busData).length} active`;
}

// Refresh "Updated: Xs ago" timestamps every 5 seconds
setInterval(() => {
  Object.values(busData).forEach((d) => {
    const card = document.getElementById(`card-${d.busId}`);
    if (card) {
      const el = card.querySelector('.card-updated');
      if (el) el.textContent = `Updated: ${timeAgo(d.timestamp)}`;
    }
  });
}, 5000);

// ── Connection status UI ──────────────────────────────────────────────────────

function setConnStatus(state) {
  connBadge.className = `conn-badge conn-${state}`;
  const labels = { connecting: 'Connecting', live: 'Live', offline: 'Offline' };
  connText.textContent = labels[state] || state;
  if (state === 'offline') {
    offlineBanner.classList.remove('hidden');
  } else {
    offlineBanner.classList.add('hidden');
  }
}

// ── Fetch initial locations (fallback / pre-socket-connect) ───────────────────

async function fetchLocations() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/locations`);
    if (!res.ok) return;
    const locations = await res.json();
    locations.forEach((d) => processUpdate(d));
  } catch {
    // Backend not reachable yet — socket will handle it
  }
}

fetchLocations();

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const socket = io(BACKEND_URL);

socket.on('connect', () => {
  console.log('Connected to backend');
  setConnStatus('live');
});

socket.on('initialLocations', (locations) => {
  console.log(`Received ${locations.length} initial bus location(s)`);
  locations.forEach((d) => processUpdate(d));
});

socket.on('locationUpdate', (d) => {
  processUpdate(d);
});

socket.on('disconnect', () => {
  console.warn('Disconnected from backend');
  setConnStatus('offline');
});

socket.on('connect_error', () => {
  setConnStatus('offline');
});
