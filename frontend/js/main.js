// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL = 'http://localhost:3000';

// Reference stop for ETA: Chennai Central
const REFERENCE_STOP = { lat: 13.0827, lon: 80.2707, name: 'Chennai Central' };

const FALLBACK_SPEED_KMH = 28;

// Route styles keyed by routeId
const ROUTE_STYLES = {
  'CHN-01': { color: '#e53935', label: '1' },
  'CHN-02': { color: '#1565c0', label: '2' },
  'CHN-03': { color: '#00897b', label: '3' },
  'CHN-04': { color: '#7b1fa2', label: '4' },
};

// ── Map setup — centred on Chennai ───────────────────────────────────────────
const map = L.map('map').setView([13.05, 80.24], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// Reference stop marker (Chennai Central)
L.marker([REFERENCE_STOP.lat, REFERENCE_STOP.lon], {
  icon: L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#f59e0b;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>',
    iconSize:   [14, 14],
    iconAnchor: [7, 7],
  }),
})
  .addTo(map)
  .bindPopup('<b>Chennai Central</b><br>ETA reference stop');

// ── State ─────────────────────────────────────────────────────────────────────
const busMarkers = {};  // busId -> Leaflet marker
const busData    = {};  // busId -> latest data
let activeFilter = 'ALL';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const busList        = document.getElementById('bus-list');
const activeCountEl  = document.getElementById('active-count');
const activeRoutesEl = document.getElementById('active-routes');
const lastUpdatedEl  = document.getElementById('last-updated');
const offlineBanner  = document.getElementById('offline-banner');
const connBadge      = document.getElementById('connection-badge');
const connText       = document.getElementById('conn-text');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRouteStyle(routeId) {
  return ROUTE_STYLES[routeId] || { color: '#6b7280', label: '?' };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEta(distKm, speedKmph) {
  const speed     = (typeof speedKmph === 'number' && speedKmph > 0) ? speedKmph : FALLBACK_SPEED_KMH;
  const totalMins = Math.round((distKm / speed) * 60);
  if (totalMins < 3)  return 'Arriving soon';
  if (totalMins < 60) return `${totalMins} min`;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const secs = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (secs < 5)  return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

function occupancyBadge(level) {
  if (!level) return '—';
  const cls = { Low: 'occ-low', Medium: 'occ-medium', High: 'occ-high' }[level] || '';
  return `<span class="occ-badge ${cls}">${level}</span>`;
}

// ── Map markers ───────────────────────────────────────────────────────────────

function createBusIcon(label, color) {
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker" style="background:${color};">${label}</div>`,
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    popupAnchor: [0, -20],
  });
}

function updateMapMarker(d) {
  const { busId, lat, lon, routeId, routeName, nextStop, speedKmph } = d;
  const style  = getRouteStyle(routeId);
  const latLng = [lat, lon];

  const popupHtml = [
    `<b>${busId}</b>`,
    routeId
      ? `<span style="color:${style.color}">&#9632;</span> ${routeId} ${routeName || ''}`
      : (routeName || 'Unknown route'),
    nextStop    ? `Next: <b>${nextStop}</b>`  : null,
    speedKmph   ? `Speed: ${speedKmph} km/h`  : null,
    `<small>(${lat.toFixed(4)}, ${lon.toFixed(4)})</small>`,
  ].filter(Boolean).join('<br>');

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
  const { busId, lat, lon, routeId, routeName, nextStop, speedKmph, occupancyLevel, timestamp } = d;
  const style   = getRouteStyle(routeId);
  const distKm  = haversineKm(lat, lon, REFERENCE_STOP.lat, REFERENCE_STOP.lon);
  const eta     = formatEta(distKm, speedKmph);
  const ago     = timeAgo(timestamp);
  const visible = (activeFilter === 'ALL' || activeFilter === routeId);

  let card = document.getElementById(`card-${busId}`);
  if (!card) {
    card = document.createElement('div');
    card.id        = `card-${busId}`;
    card.className = 'bus-card';
    busList.appendChild(card);
  }

  card.style.borderLeftColor = style.color;
  card.style.display         = visible ? '' : 'none';

  card.innerHTML = `
    <div class="card-header">
      <span class="card-bus-id">${busId}</span>
      <span class="live-badge"><span class="live-dot"></span>LIVE</span>
    </div>
    <p class="card-route" style="color:${style.color}">${routeId || ''} ${routeName || 'Unknown route'}</p>
    ${nextStop ? `<p class="card-stop">&#8594; ${nextStop}</p>` : ''}
    <div class="card-stats">
      <div class="stat">
        <div class="stat-label">Distance</div>
        <div class="stat-value">${distKm.toFixed(1)} km</div>
      </div>
      <div class="stat">
        <div class="stat-label">ETA &middot; Central</div>
        <div class="stat-value">${eta}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Speed</div>
        <div class="stat-value">${speedKmph != null ? speedKmph + ' km/h' : '—'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Occupancy</div>
        <div class="stat-value">${occupancyBadge(occupancyLevel)}</div>
      </div>
    </div>
    <p class="card-updated">Updated: ${ago}</p>
  `;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function updateStats() {
  const buses   = Object.values(busData);
  const routes  = new Set(buses.map(b => b.routeId).filter(Boolean));
  activeCountEl.textContent  = buses.length;
  activeRoutesEl.textContent = routes.size;
  lastUpdatedEl.textContent  = buses.length
    ? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
}

// ── Main update handler ───────────────────────────────────────────────────────

function processUpdate(d) {
  busData[d.busId] = d;
  updateMapMarker(d);
  updateSidebarCard(d);
  updateStats();
}

// ── Route filter ──────────────────────────────────────────────────────────────

function setFilter(routeId) {
  activeFilter = routeId;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.route === routeId);
  });
  Object.values(busData).forEach(d => {
    const card = document.getElementById(`card-${d.busId}`);
    if (card) card.style.display = (routeId === 'ALL' || routeId === d.routeId) ? '' : 'none';
  });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => setFilter(btn.dataset.route));
});

// ── Refresh "Updated: Xs ago" every 5 seconds ─────────────────────────────────
setInterval(() => {
  Object.values(busData).forEach(d => {
    const el = document.querySelector(`#card-${d.busId} .card-updated`);
    if (el) el.textContent = `Updated: ${timeAgo(d.timestamp)}`;
  });
}, 5000);

// ── Connection status ─────────────────────────────────────────────────────────

let connStatus = 'connecting';

function setConnStatus(state) {
  if (state === connStatus) return;   // skip redundant DOM updates
  connStatus = state;
  connBadge.className = `conn-badge conn-${state}`;
  connText.textContent = { connecting: 'Connecting', live: 'Live', offline: 'Offline' }[state] || state;
  offlineBanner.classList.toggle('hidden', state !== 'offline');
}

// ── Fetch initial locations ───────────────────────────────────────────────────

async function fetchLocations() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/locations`);
    if (!res.ok) return;
    const locations = await res.json();
    locations.forEach(d => processUpdate(d));
  } catch {
    // backend not reachable yet — socket will handle it
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
  setConnStatus('live');  // data received = connection is live
  console.log(`Received ${locations.length} initial bus location(s)`);
  locations.forEach(d => processUpdate(d));
});

socket.on('locationUpdate', (d) => {
  setConnStatus('live');  // data received = connection is live
  processUpdate(d);
});

socket.on('disconnect', () => {
  console.warn('Disconnected from backend');
  setConnStatus('offline');
});

socket.on('connect_error', () => setConnStatus('offline'));
