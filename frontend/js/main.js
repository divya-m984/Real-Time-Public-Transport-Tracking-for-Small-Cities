// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_URL     = 'http://localhost:3000';
const DEFAULT_CITY_ID = 'chennai';

// ── App state ─────────────────────────────────────────────────────────────────
const appState = {
  selectedCityId:   DEFAULT_CITY_ID,
  fromStopId:       null,
  toStopId:         null,
  availableStops:   [],
  hasSearched:      false,
  matchingJourneys: [],
  matchingRouteIds: new Set(),
  busMarkers:       new Map(),   // `${cityId}:${busId}` -> Leaflet marker
  routeLayers:      [],          // Leaflet polylines for route segments
  stopLayers:       [],          // Leaflet markers for origin/destination
};

// ── Data caches ───────────────────────────────────────────────────────────────
let citiesConfig = [];   // city config array from /api/cities
let cityById     = {};   // cityId -> city config
const routeStyles = {};  // routeId -> { color, label }
const busData    = {};   // busData[cityId][busId] = latest location object

// ── DOM refs ──────────────────────────────────────────────────────────────────
const citySelector   = document.getElementById('city-selector');
const cityLabelEl    = document.getElementById('city-label');
const sidebarCity    = document.getElementById('sidebar-city-name');
const activeCountEl  = document.getElementById('active-count');
const activeRoutesEl = document.getElementById('active-routes');
const lastUpdatedEl  = document.getElementById('last-updated');
const offlineBanner  = document.getElementById('offline-banner');
const connBadge      = document.getElementById('connection-badge');
const connText       = document.getElementById('conn-text');
const resultsPanel   = document.getElementById('results-panel');
const findBtn        = document.getElementById('find-btn');
const clearBtnEl     = document.getElementById('clear-btn');
const swapBtnEl      = document.getElementById('swap-btn');

// ── Map ───────────────────────────────────────────────────────────────────────
const map = L.map('map').setView([13.0827, 80.2707], 12);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
}).addTo(map);

// ── Helpers ───────────────────────────────────────────────────────────────────

function occupancyBadge(level) {
  if (!level) return '';
  const cls = { Low: 'occ-low', Medium: 'occ-medium', High: 'occ-high' }[level] || '';
  return `<span class="occ-badge ${cls}">${level}</span>`;
}

function getRouteStyle(routeId) {
  // Return routes end with 'R'; look up the base forward route style
  const baseId = (routeId && routeId.endsWith('R')) ? routeId.slice(0, -1) : routeId;
  return routeStyles[baseId] || routeStyles[routeId] || { color: '#6b7280', label: '?' };
}

// ── Combobox factory ──────────────────────────────────────────────────────────
// Returns an object with setOptions / setValue / getValue / clear methods.

function makeCombobox(container, placeholder, onSelect) {
  const input    = document.createElement('input');
  input.type     = 'text';
  input.className = 'combobox-input';
  input.placeholder = placeholder;
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-autocomplete', 'list');

  const dropdown = document.createElement('div');
  dropdown.className = 'combobox-dropdown hidden';
  dropdown.setAttribute('role', 'listbox');

  container.appendChild(input);
  container.appendChild(dropdown);

  let options        = [];   // [{stopId, name}]
  let selectedStopId = null;
  let highlightedIdx = -1;

  function getFiltered(query) {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.name.toLowerCase().includes(q));
  }

  function renderDropdown(query) {
    const filtered = getFiltered(query);
    dropdown.innerHTML = '';

    if (filtered.length === 0) {
      const noResult = document.createElement('div');
      noResult.className = 'combobox-option';
      noResult.style.cssText = 'color:var(--muted);cursor:default';
      noResult.textContent = 'No stops found';
      dropdown.appendChild(noResult);
    } else {
      filtered.forEach(opt => {
        const div = document.createElement('div');
        div.className  = 'combobox-option' + (opt.stopId === selectedStopId ? ' selected' : '');
        div.dataset.stopId = opt.stopId;
        div.setAttribute('role', 'option');
        div.textContent = opt.name;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          selectOption(opt);
        });
        dropdown.appendChild(div);
      });
    }

    highlightedIdx = -1;
    dropdown.classList.remove('hidden');
    input.setAttribute('aria-expanded', 'true');
  }

  function selectOption(opt) {
    selectedStopId = opt.stopId;
    input.value    = opt.name;
    closeDropdown();
    onSelect(opt.stopId);
  }

  function closeDropdown() {
    dropdown.classList.add('hidden');
    input.setAttribute('aria-expanded', 'false');
    highlightedIdx = -1;
  }

  function updateHighlight(items) {
    items.forEach((el, i) => el.classList.toggle('highlighted', i === highlightedIdx));
    if (items[highlightedIdx]) items[highlightedIdx].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('focus', () => renderDropdown(input.value));

  input.addEventListener('input', () => {
    if (selectedStopId) {
      selectedStopId = null;
      onSelect(null);
    }
    renderDropdown(input.value);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      closeDropdown();
      // Restore the selected stop's name, or clear if nothing is selected
      if (selectedStopId) {
        const opt = options.find(o => o.stopId === selectedStopId);
        if (opt) input.value = opt.name;
      } else {
        input.value = '';
      }
    }, 150);
  });

  input.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.combobox-option[data-stop-id]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIdx = Math.min(highlightedIdx + 1, items.length - 1);
      updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIdx = Math.max(highlightedIdx - 1, 0);
      updateHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIdx >= 0 && items[highlightedIdx]) {
        const stopId = items[highlightedIdx].dataset.stopId;
        const opt    = options.find(o => o.stopId === stopId);
        if (opt) selectOption(opt);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  });

  return {
    setOptions(stops) {
      options        = stops;
      selectedStopId = null;
      input.value    = '';
    },
    setValue(stopId) {
      const opt = options.find(o => o.stopId === stopId);
      if (opt) {
        selectedStopId = opt.stopId;
        input.value    = opt.name;
      } else {
        selectedStopId = null;
        input.value    = '';
      }
    },
    getValue() { return selectedStopId; },
    clear() {
      selectedStopId = null;
      input.value    = '';
      closeDropdown();
    },
  };
}

// ── Instantiate comboboxes ────────────────────────────────────────────────────
const fromCombobox = makeCombobox(
  document.getElementById('from-combobox'),
  'Search stops\u2026',
  stopId => { appState.fromStopId = stopId; }
);

const toCombobox = makeCombobox(
  document.getElementById('to-combobox'),
  'Search stops\u2026',
  stopId => { appState.toStopId = stopId; }
);

// ── Load canonical stops for a city ──────────────────────────────────────────
async function loadStops(cityId) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/stops?cityId=${encodeURIComponent(cityId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const stops = await res.json();
    appState.availableStops = stops;
    fromCombobox.setOptions(stops);
    toCombobox.setOptions(stops);
  } catch (err) {
    console.error('Failed to load stops for', cityId, err);
    appState.availableStops = [];
    fromCombobox.setOptions([]);
    toCombobox.setOptions([]);
  }
}

// ── Map markers ───────────────────────────────────────────────────────────────

function createBusIcon(label, color) {
  return L.divIcon({
    className:   '',
    html:        `<div class="bus-marker" style="background:${color};">${label}</div>`,
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    popupAnchor: [0, -20],
  });
}

function updateMapMarker(d) {
  const { cityId, busId, lat, lon, routeId, routeName, nextStop, speedKmph } = d;
  const style  = getRouteStyle(routeId);
  const latLng = [lat, lon];
  const key    = `${cityId}:${busId}`;

  const popupHtml = [
    `<b>${busId}</b>`,
    routeId
      ? `<span style="color:${style.color}">&#9632;</span> ${routeId}${routeName ? ' ' + routeName : ''}`
      : (routeName || 'Unknown route'),
    nextStop  ? `Next: <b>${nextStop}</b>` : null,
    speedKmph ? `Speed: ${speedKmph} km/h`  : null,
    `<small>(${lat.toFixed(4)}, ${lon.toFixed(4)})</small>`,
  ].filter(Boolean).join('<br>');

  if (appState.busMarkers.has(key)) {
    const m = appState.busMarkers.get(key);
    m.setLatLng(latLng);
    m.setIcon(createBusIcon(style.label, style.color));
    m.getPopup().setContent(popupHtml);
  } else {
    const m = L.marker(latLng, { icon: createBusIcon(style.label, style.color) })
      .addTo(map)
      .bindPopup(popupHtml);
    appState.busMarkers.set(key, m);
  }
}

function clearBusMarkers() {
  appState.busMarkers.forEach(m => m.remove());
  appState.busMarkers.clear();
}

function clearMapLayers() {
  appState.routeLayers.forEach(l => l.remove());
  appState.routeLayers = [];
  appState.stopLayers.forEach(l => l.remove());
  appState.stopLayers = [];
}

// ── Journey search ────────────────────────────────────────────────────────────

async function performSearch() {
  const { selectedCityId, fromStopId, toStopId } = appState;
  if (!fromStopId || !toStopId) return;

  findBtn.disabled    = true;
  findBtn.textContent = 'Searching\u2026';

  clearBusMarkers();
  clearMapLayers();
  appState.hasSearched      = false;
  appState.matchingRouteIds = new Set();

  try {
    const url =
      `${BACKEND_URL}/api/journeys` +
      `?cityId=${encodeURIComponent(selectedCityId)}` +
      `&fromStopId=${encodeURIComponent(fromStopId)}` +
      `&toStopId=${encodeURIComponent(toStopId)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const data = await res.json();

    appState.hasSearched      = true;
    appState.matchingJourneys = data.journeys;
    appState.matchingRouteIds = new Set(data.journeys.map(j => j.routeId));

    renderJourneyResults(data);
    drawJourneyOnMap(data);
    clearBtnEl.classList.remove('hidden');

    // Show any buses already received that match the results
    Object.values(busData[selectedCityId] || {}).forEach(d => {
      if (appState.matchingRouteIds.has(d.routeId)) updateMapMarker(d);
    });

    updateStats();
  } catch (err) {
    console.error('Journey search failed:', err);
    resultsPanel.innerHTML =
      `<p class="empty-message">Search failed: ${err.message}</p>`;
  } finally {
    findBtn.disabled    = false;
    findBtn.textContent = 'Find Buses';
  }
}

function renderJourneyResults(data) {
  const { fromStop, toStop, journeys } = data;
  resultsPanel.innerHTML = '';

  if (journeys.length === 0) {
    resultsPanel.innerHTML =
      `<p class="no-direct-route">No direct route found between <b>${fromStop.name}</b> and <b>${toStop.name}</b>.<br>Try swapping origin and destination, or choose different stops.</p>`;
    return;
  }

  journeys.forEach(journey => {
    const card = document.createElement('div');
    card.className = 'journey-card';
    card.dataset.routeId = journey.routeId;
    card.style.borderLeftColor = journey.color || '#6b7280';

    const stopCount = journey.intermediateStopCount;
    const stopCountLabel = stopCount === 0 ? 'Direct' : `${stopCount + 1} stops`;

    let busesHtml;
    if (journey.activeBuses.length === 0) {
      busesHtml = '<p class="no-active-buses">No active buses right now.</p>';
    } else {
      busesHtml =
        '<div class="active-buses">' +
        journey.activeBuses.map(bus =>
          `<div class="bus-row" data-bus-id="${bus.busId}">` +
            `<span class="bus-row-id">${bus.busId}</span>` +
            `<span class="bus-row-eta">${bus.etaLabel}</span>` +
            occupancyBadge(bus.occupancyLevel) +
          `</div>`
        ).join('') +
        '</div>';
    }

    card.innerHTML =
      `<div class="journey-header">` +
        `<span class="route-pill" style="background:${journey.color || '#6b7280'}">${journey.routeNumber}</span>` +
        `<span class="journey-route-name" title="${journey.routeName}">${journey.routeName}</span>` +
        `<span class="journey-stop-count">${stopCountLabel}</span>` +
      `</div>` +
      `<div class="journey-stops">` +
        `<span class="stop-name">${fromStop.name}</span>` +
        `<span class="stop-arrow"> &rarr; </span>` +
        `<span class="stop-name">${toStop.name}</span>` +
      `</div>` +
      busesHtml;

    resultsPanel.appendChild(card);
  });
}

function drawJourneyOnMap(data) {
  clearMapLayers();

  const { fromStop, toStop, journeys } = data;
  if (journeys.length === 0) return;

  const bounds = L.latLngBounds();

  journeys.forEach(journey => {
    const coords = journey.routeSegmentStops.map(s => [s.lat, s.lon]);
    if (coords.length >= 2) {
      const poly = L.polyline(coords, {
        color:   journey.color || '#6b7280',
        weight:  5,
        opacity: 0.75,
      }).addTo(map);
      appState.routeLayers.push(poly);
      coords.forEach(c => bounds.extend(c));
    }
  });

  // Origin marker — green circle
  const fromM = L.circleMarker([fromStop.lat, fromStop.lon], {
    radius: 9, color: '#fff', weight: 2.5,
    fillColor: '#22c55e', fillOpacity: 1,
  }).addTo(map).bindPopup(`<b>From:</b> ${fromStop.name}`);
  appState.stopLayers.push(fromM);
  bounds.extend([fromStop.lat, fromStop.lon]);

  // Destination marker — red circle
  const toM = L.circleMarker([toStop.lat, toStop.lon], {
    radius: 9, color: '#fff', weight: 2.5,
    fillColor: '#ef4444', fillOpacity: 1,
  }).addTo(map).bindPopup(`<b>To:</b> ${toStop.name}`);
  appState.stopLayers.push(toM);
  bounds.extend([toStop.lat, toStop.lon]);

  if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50] });
}

// ── Clear search ──────────────────────────────────────────────────────────────

function clearSearch() {
  appState.hasSearched      = false;
  appState.matchingJourneys = [];
  appState.matchingRouteIds = new Set();
  appState.fromStopId       = null;
  appState.toStopId         = null;

  fromCombobox.clear();
  toCombobox.clear();
  clearBusMarkers();
  clearMapLayers();

  resultsPanel.innerHTML =
    '<p class="empty-message" id="pre-search-hint">Select origin and destination stops above.</p>';
  clearBtnEl.classList.add('hidden');
  updateStats();
}

// ── Process bus location updates ──────────────────────────────────────────────
// Only put buses on the map when a search is active AND the bus is on a matching route.

function processUpdate(d) {
  if (!d || !d.cityId || !d.busId) return;
  if (d.cityId !== appState.selectedCityId) return;

  if (!busData[d.cityId]) busData[d.cityId] = {};
  busData[d.cityId][d.busId] = d;

  if (appState.hasSearched && appState.matchingRouteIds.has(d.routeId)) {
    updateMapMarker(d);
  }

  updateStats();
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function updateStats() {
  const cityId = appState.selectedCityId;
  if (appState.hasSearched) {
    const matchingBuses = Object.values(busData[cityId] || {})
      .filter(b => appState.matchingRouteIds.has(b.routeId));
    activeCountEl.textContent  = matchingBuses.length;
    activeRoutesEl.textContent = appState.matchingRouteIds.size;
    lastUpdatedEl.textContent  = matchingBuses.length > 0
      ? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '—';
  } else {
    activeCountEl.textContent  = '0';
    activeRoutesEl.textContent = '0';
    lastUpdatedEl.textContent  = '—';
  }
}

// ── Route style cache ─────────────────────────────────────────────────────────

function buildRouteStyles(routes) {
  routes.forEach((route, idx) => {
    routeStyles[route.routeId] = { color: route.color, label: String(idx + 1) };
  });
}

// ── City tabs ─────────────────────────────────────────────────────────────────

function buildCityTabs(cities) {
  citySelector.innerHTML = '';
  cities.forEach(city => {
    const btn = document.createElement('button');
    btn.className      = 'city-tab';
    btn.dataset.cityId = city.id;
    btn.textContent    = city.name;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', city.id === appState.selectedCityId ? 'true' : 'false');
    if (city.id === appState.selectedCityId) btn.classList.add('active');
    btn.addEventListener('click', () => {
      if (city.id !== appState.selectedCityId) switchCity(city.id);
    });
    citySelector.appendChild(btn);
  });
}

// ── Connection status ─────────────────────────────────────────────────────────

let connStatus = 'connecting';

function setConnStatus(state) {
  if (state === connStatus) return;
  connStatus = state;
  connBadge.className  = `conn-badge conn-${state}`;
  connText.textContent = { connecting: 'Connecting', live: 'Live', offline: 'Offline' }[state] || state;
  offlineBanner.classList.toggle('hidden', state !== 'offline');
}

// ── City switching ────────────────────────────────────────────────────────────

async function switchCity(cityId) {
  if (!cityById[cityId]) {
    console.error(`switchCity: unknown cityId "${cityId}"`);
    return;
  }

  const prev = appState.selectedCityId;
  if (socket.connected && prev !== cityId) {
    socket.emit('leaveCity', { cityId: prev });
  }

  // Reset all state for the new city
  appState.selectedCityId   = cityId;
  appState.fromStopId       = null;
  appState.toStopId         = null;
  appState.hasSearched      = false;
  appState.matchingJourneys = [];
  appState.matchingRouteIds = new Set();
  busData[cityId]           = {};

  fromCombobox.clear();
  toCombobox.clear();
  clearBusMarkers();
  clearMapLayers();
  clearBtnEl.classList.add('hidden');
  resultsPanel.innerHTML =
    '<p class="empty-message" id="pre-search-hint">Select origin and destination stops above.</p>';

  try { localStorage.setItem('selectedCityId', cityId); } catch {}

  citySelector.querySelectorAll('.city-tab').forEach(tab => {
    const active = tab.dataset.cityId === cityId;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const city = cityById[cityId];
  cityLabelEl.textContent = city.label;
  sidebarCity.textContent = `${city.name} \u2014 Journey Search`;
  document.title          = `${city.label} \u2014 Transit Live India`;

  map.setView(city.mapCenter, city.defaultZoom);
  activeCountEl.textContent  = '0';
  activeRoutesEl.textContent = '0';
  lastUpdatedEl.textContent  = '\u2014';

  // Load routes (for routeStyles used by bus markers)
  try {
    const res = await fetch(`${BACKEND_URL}/api/routes?cityId=${encodeURIComponent(cityId)}`);
    if (res.ok) buildRouteStyles(await res.json());
  } catch (err) {
    console.error('Failed to load routes for', cityId, err);
  }

  // Load stops for comboboxes
  await loadStops(cityId);

  // Join the new city's socket room
  if (socket.connected) socket.emit('joinCity', { cityId });
}

// ── Event listeners ───────────────────────────────────────────────────────────

findBtn.addEventListener('click', () => {
  if (appState.fromStopId && appState.toStopId) performSearch();
});

clearBtnEl.addEventListener('click', clearSearch);

swapBtnEl.addEventListener('click', () => {
  const prevFrom = appState.fromStopId;
  const prevTo   = appState.toStopId;
  appState.fromStopId = prevTo;
  appState.toStopId   = prevFrom;
  fromCombobox.setValue(appState.fromStopId);
  toCombobox.setValue(appState.toStopId);
});

// ── Socket.IO ─────────────────────────────────────────────────────────────────

const socket = io(BACKEND_URL);

socket.on('connect', () => {
  setConnStatus('live');
  socket.emit('joinCity', { cityId: appState.selectedCityId });
});

socket.on('initialLocations', locations => {
  setConnStatus('live');
  locations.forEach(d => processUpdate(d));
});

socket.on('locationUpdate', d => {
  setConnStatus('live');
  processUpdate(d);
});

socket.on('serverError', ({ message }) => {
  console.error('Server error:', message);
});

socket.on('disconnect', () => setConnStatus('offline'));
socket.on('connect_error', () => setConnStatus('offline'));

// ── Initialise ────────────────────────────────────────────────────────────────

async function init() {
  let savedCityId;
  try { savedCityId = localStorage.getItem('selectedCityId'); } catch {}

  try {
    const res = await fetch(`${BACKEND_URL}/api/cities`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    citiesConfig = await res.json();
    citiesConfig.forEach(c => { cityById[c.id] = c; });
  } catch (err) {
    console.error('Could not load city config from backend:', err);
    // Minimal fallback so the page remains usable when the backend is briefly unavailable
    citiesConfig = [
      { id: 'chennai', name: 'Chennai', label: 'Chennai Transit Live', mapCenter: [13.0827, 80.2707], defaultZoom: 12 },
      { id: 'mumbai',  name: 'Mumbai',  label: 'Mumbai Transit Live',  mapCenter: [19.0760, 72.8777], defaultZoom: 12 },
      { id: 'delhi',   name: 'Delhi',   label: 'Delhi Transit Live',   mapCenter: [28.6139, 77.2090], defaultZoom: 12 },
    ];
    citiesConfig.forEach(c => { cityById[c.id] = c; });
  }

  const startCityId =
    (savedCityId && cityById[savedCityId]) ? savedCityId : DEFAULT_CITY_ID;
  appState.selectedCityId = startCityId;

  buildCityTabs(citiesConfig);
  await switchCity(startCityId);
}

init();
