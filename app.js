// Change this to your group server URL.
const BASE_URL = "https://airline-api-79806812877.us-central1.run.app";

// Keep all endpoint paths here
const ENDPOINTS = {
  login: "/auth/login",
  searchFlights: "/flights/search",
  passengerTickets: "/passenger/tickets",
  cancelTicket: (ticketNum) =>
    `/passenger/tickets/${encodeURIComponent(ticketNum)}/cancel`,
  agentPassengerSearch: "/agent/passengers/search",
  agentTickets: "/agent/tickets",
  agentRefund: (ticketNum) =>
    `/agent/tickets/${encodeURIComponent(ticketNum)}/refund`,
  crewSchedule: "/crew/schedule",
  crewFlightStatus: (flightNum) =>
    `/crew/flights/${encodeURIComponent(flightNum)}/status`,
  crewIncidents: "/crew/incidents",
  adminFlights: "/admin/flights",
  adminAircraft: "/admin/aircraft"
};

// Supported hash routes in the SPA.
const ROUTES = new Set([
  "#/login",
  "#/passenger",
  "#/agent",
  "#/crew",
  "#/admin"
]);

// Default page per authenticated role.
const ROLE_TO_ROUTE = {
  passenger: "#/passenger",
  agent: "#/agent",
  crew: "#/crew",
  admin: "#/admin"
};

// Local storage keys for auth/session info.
const AUTH_KEYS = {
  token: "airline_token",
  role: "airline_role",
  name: "airline_name",
  email: "airline_email"
};

const AIRPORT_CODES = ["ATL", "DFW", "DEN", "ORD", "LAX", "JFK", "SEA", "MIA", "IAH", "PHX"];
const CABIN_CLASSES = ["ECONOMY", "BUSINESS", "FIRST"];
const FLIGHT_STATUSES = ["SCHEDULED", "BOARDING", "DELAYED", "IN_AIR", "LANDED", "CANCELLED"];
const SEAT_SUGGESTIONS = buildSeatSuggestions();
const GATE_OPTIONS = Array.from({ length: 40 }, (_unused, i) => `G${String(i + 1).padStart(2, "0")}`);
const TERMINAL_OPTIONS = Array.from({ length: 8 }, (_unused, i) => String(i + 1).padStart(2, "0"));
const INCIDENT_DESCRIPTIONS = [
  "Minor maintenance issue reported.",
  "Late baggage load caused departure delay.",
  "Cabin cleaning needed before boarding.",
  "Mechanical check requested by crew.",
  "Gate change due to congestion."
];
const PASSENGER_QUERY_FALLBACK = buildPassengerQueryFallback();

// Values shown in the debug panel.
const debugState = {
  lastUrl: "-",
  lastError: "-"
};

// In-memory UI data by feature/role.
const state = {
  passengerResults: [],
  passengerFlightCatalog: [],
  passengerTickets: [],
  agentPassengers: [],
  agentRecentTickets: [],
  crewSchedule: [],
  adminFlights: [],
  adminAircraft: []
};

const appEl = document.getElementById("app");
const statusEl = document.getElementById("status");
const roleEl = document.getElementById("current-role");
const logoutBtn = document.getElementById("logout-btn");
const debugTemplate = document.getElementById("debug-panel-template");

window.addEventListener("hashchange", renderRoute);
document.addEventListener("DOMContentLoaded", init);

// Bootstraps event handlers and first render.
function init() {
  logoutBtn.addEventListener("click", onLogout);
  if (!location.hash) {
    location.hash = "#/login";
    return;
  }
  renderRoute();
}

function onLogout() {
  clearAuth();
  setStatus("Logged out.", "info");
  location.hash = "#/login";
}

function renderRoute() {
  const route = normalizeRoute(location.hash);
  const auth = getAuth();

  updateTopbar(auth.role);
  updateRouteNav(route);

  if (route !== location.hash) {
    location.hash = route;
    return;
  }

  if (route !== "#/login") {
    if (!auth.token || !auth.role) {
      setStatus("Please log in first.", "error");
      location.hash = "#/login";
      return;
    }
    const expected = ROLE_TO_ROUTE[auth.role];
    if (expected && route !== expected) {
      setStatus(`Logged in as ${auth.role}. Redirected.`, "info");
      location.hash = expected;
      return;
    }
  }

  switch (route) {
    case "#/login":
      renderLoginPage();
      break;
    case "#/passenger":
      renderPassengerPage();
      break;
    case "#/agent":
      renderAgentPage();
      break;
    case "#/crew":
      renderCrewPage();
      break;
    case "#/admin":
      renderAdminPage();
      break;
    default:
      renderLoginPage();
  }
}

function normalizeRoute(hash) {
  return ROUTES.has(hash) ? hash : "#/login";
}

function updateTopbar(role) {
  roleEl.textContent = `Role: ${role || "guest"}`;
}

function updateRouteNav(route) {
  document.querySelectorAll(".route-nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === route);
  });
}

function setStatus(message, type = "info") {
  statusEl.textContent = message || "";
  statusEl.className = `status ${type}`;
}

function getAuth() {
  return {
    token: localStorage.getItem(AUTH_KEYS.token) || "",
    role: (localStorage.getItem(AUTH_KEYS.role) || "").toLowerCase(),
    name: localStorage.getItem(AUTH_KEYS.name) || "",
    email: localStorage.getItem(AUTH_KEYS.email) || ""
  };
}

function saveAuth(auth) {
  localStorage.setItem(AUTH_KEYS.token, auth.token || "");
  localStorage.setItem(AUTH_KEYS.role, (auth.role || "").toLowerCase());
  localStorage.setItem(AUTH_KEYS.name, auth.name || "");
  localStorage.setItem(AUTH_KEYS.email, auth.email || "");
}

function clearAuth() {
  Object.values(AUTH_KEYS).forEach((key) => localStorage.removeItem(key));
}

// Shared API helper with auth header, JSON parsing, and error handling.
async function apiRequest(method, endpoint, options = {}) {
  const path = typeof endpoint === "function" ? endpoint() : endpoint;
  const url = buildUrl(path, options.query);
  debugState.lastUrl = url;
  refreshDebugPanel();

  const headers = { Accept: "application/json" };
  const auth = getAuth();
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  if (options.body) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch (err) {
    handleError(`Network error: ${err.message}`);
    throw err;
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text };
    }
  }

  if (!response.ok) {
    const message = getApiErrorMessage(payload, response.status);
    const error = new Error(message);
    error.status = response.status;
    error.data = payload;
    handleError(message);
    throw error;
  }

  return payload;
}

function buildUrl(path, query) {
  const base = BASE_URL.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(base + cleanPath);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        url.searchParams.set(k, String(v));
      }
    });
  }
  return url.toString();
}

function getApiErrorMessage(payload, status) {
  if (typeof payload === "string") return payload;
  if (!payload) return `Request failed (${status})`;
  return (
    payload.message ||
    payload.error ||
    payload.detail ||
    `Request failed (${status})`
  );
}

function handleError(message) {
  debugState.lastError = message || "-";
  refreshDebugPanel();
  setStatus(message || "Request failed.", "error");
}

function refreshDebugPanel() {
  document.querySelectorAll("[data-debug-url]").forEach((el) => {
    el.textContent = debugState.lastUrl || "-";
  });
  document.querySelectorAll("[data-debug-error]").forEach((el) => {
    el.textContent = debugState.lastError || "-";
  });
}

function debugPanelHtml() {
  return debugTemplate ? debugTemplate.innerHTML : "";
}

// Accepts several common API wrapper shapes and returns rows.
function toArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function normalizeFlight(row = {}) {
  return {
    flight_num: pick(row, ["flight_num", "flightNum"]),
    depart_time: pick(row, ["depart_time", "departTime"]),
    arrival_time: pick(row, ["arrival_time", "arrivalTime"]),
    origin: pick(row, ["origin", "from"]),
    destination: pick(row, ["destination", "to"]),
    status: pick(row, ["status"]),
    gate: pick(row, ["gate"]),
    terminal: pick(row, ["terminal"]),
    tail_number: pick(row, ["tail_number", "tailNumber"])
  };
}

function normalizeTicket(row = {}) {
  return {
    ticket_num: pick(row, ["ticket_num", "ticketNum"]),
    flight_num: pick(row, ["flight_num", "flightNum"]),
    seat_num: pick(row, ["seat_num", "seatNum"]),
    class: pick(row, ["class", "ticket_class", "cabin_class"]),
    status: pick(row, ["status"]),
    date_booked: pick(row, ["date_booked", "dateBooked", "created_at"])
  };
}

function normalizePassenger(row = {}) {
  let first = pick(row, ["first_name", "firstName"]);
  let last = pick(row, ["last_name", "lastName"]);
  const name = pick(row, ["name"]);

  if ((!first || !last) && name) {
    const parts = String(name).trim().split(/\s+/);
    first = first || parts[0] || "";
    last = last || parts.slice(1).join(" ");
  }

  return {
    ssn: pick(row, ["ssn"]),
    first_name: first,
    last_name: last,
    passport_num: pick(row, ["passport_num", "passportNum"]),
    email: pick(row, ["email"]),
    phone: pick(row, ["phone"])
  };
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildSeatSuggestions(maxRows = 50) {
  const seats = [];
  for (let row = 1; row <= maxRows; row += 1) {
    for (const letter of ["A", "B", "C", "D", "E", "F"]) {
      seats.push(`${row}${letter}`);
    }
  }
  return seats;
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function selectOptionsHtml(values = []) {
  return uniqueStrings(values)
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

function updateSelect(id, values, placeholder = "Select one") {
  const selectEl = document.getElementById(id);
  if (!selectEl) return;
  const current = String(selectEl.value || "");
  const options = uniqueStrings(values);
  selectEl.innerHTML = `
    <option value="">${escapeHtml(placeholder)}</option>
    ${selectOptionsHtml(options)}
  `;
  if (current && options.includes(current)) {
    selectEl.value = current;
  }
}

function getFlightDateValue(flight) {
  const raw = String(flight?.depart_time || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : formatDateOnly(parsed);
}

function passengerSearchFlights() {
  const pool = state.passengerFlightCatalog.length ? state.passengerFlightCatalog : state.passengerResults;
  return pool.filter((f) => f && f.origin && f.destination);
}

function knownAirports() {
  return uniqueStrings([
    ...AIRPORT_CODES,
    ...state.passengerFlightCatalog.map((f) => f.origin),
    ...state.passengerFlightCatalog.map((f) => f.destination),
    ...state.passengerResults.map((f) => f.origin),
    ...state.passengerResults.map((f) => f.destination),
    ...state.crewSchedule.map((f) => f.origin),
    ...state.crewSchedule.map((f) => f.destination),
    ...state.adminFlights.map((f) => f.origin),
    ...state.adminFlights.map((f) => f.destination)
  ]);
}

function knownFlightNumbers() {
  const known = uniqueStrings([
    ...state.passengerFlightCatalog.map((f) => f.flight_num),
    ...state.passengerResults.map((f) => f.flight_num),
    ...state.passengerTickets.map((t) => t.flight_num),
    ...state.crewSchedule.map((f) => f.flight_num),
    ...state.adminFlights.map((f) => f.flight_num)
  ]);
  if (known.length) return known;
  return Array.from({ length: 50 }, (_unused, i) => `F${String(i + 1).padStart(5, "0")}`);
}

function knownTailNumbers() {
  const known = uniqueStrings([
    ...state.passengerFlightCatalog.map((f) => f.tail_number),
    ...state.passengerResults.map((f) => f.tail_number),
    ...state.crewSchedule.map((f) => f.tail_number),
    ...state.adminFlights.map((f) => f.tail_number),
    ...state.adminAircraft.map((a) => pick(a, ["tail_number", "tailNumber"]))
  ]);
  if (known.length) return known;
  return Array.from({ length: 30 }, (_unused, i) => `TN${String(i + 1).padStart(4, "0")}`);
}

function knownTicketNumbers() {
  const known = uniqueStrings([
    ...state.passengerTickets.map((t) => t.ticket_num),
    ...state.agentRecentTickets
  ]);
  if (known.length) return known;
  return Array.from({ length: 30 }, (_unused, i) => `T${String(i + 1).padStart(6, "0")}`);
}

function knownPassengerQueries() {
  const fromSearch = uniqueStrings(
    state.agentPassengers.flatMap((p) => {
      const fullName = `${p.first_name || ""} ${p.last_name || ""}`.trim();
      return [p.ssn, p.email, p.passport_num, fullName];
    })
  );
  return uniqueStrings([...fromSearch, ...PASSENGER_QUERY_FALLBACK]);
}

function refreshPassengerSearchFilters() {
  const originEl = document.getElementById("passenger-origin");
  const destinationEl = document.getElementById("passenger-destination");
  const dateEl = document.getElementById("passenger-date");
  if (!originEl || !destinationEl || !dateEl) return;

  const flights = passengerSearchFlights();
  if (!flights.length) {
    updateSelect("passenger-origin", knownAirports(), "Any origin");
    updateSelect("passenger-destination", knownAirports(), "Any destination");
    updateSelect("passenger-date", buildDateOptions(14), "Any date");
    return;
  }

  for (let i = 0; i < 3; i += 1) {
    const selectedOrigin = String(originEl.value || "");
    const selectedDestination = String(destinationEl.value || "");
    const selectedDate = String(dateEl.value || "");
    const before = `${selectedOrigin}|${selectedDestination}|${selectedDate}`;

    const originValues = flights
      .filter((f) => (!selectedDestination || f.destination === selectedDestination) && (!selectedDate || getFlightDateValue(f) === selectedDate))
      .map((f) => f.origin);

    const destinationValues = flights
      .filter((f) => (!selectedOrigin || f.origin === selectedOrigin) && (!selectedDate || getFlightDateValue(f) === selectedDate))
      .map((f) => f.destination);

    const dateValues = flights
      .filter((f) => (!selectedOrigin || f.origin === selectedOrigin) && (!selectedDestination || f.destination === selectedDestination))
      .map((f) => getFlightDateValue(f))
      .filter(Boolean)
      .sort();

    updateSelect("passenger-origin", originValues, "Any origin");
    updateSelect("passenger-destination", destinationValues, "Any destination");
    updateSelect("passenger-date", dateValues, "Any date");

    const after = `${originEl.value || ""}|${destinationEl.value || ""}|${dateEl.value || ""}`;
    if (before === after) break;
  }
}

function onPassengerSearchFilterChange() {
  refreshPassengerSearchFilters();
}

async function loadPassengerFlightCatalog() {
  try {
    const auth = getAuth();
    const url = buildUrl(ENDPOINTS.searchFlights);
    const headers = { Accept: "application/json" };
    if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) return;
    const text = await response.text();
    let payload = [];
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = [];
      }
    }
    state.passengerFlightCatalog = toArray(payload).map(normalizeFlight);
    refreshPassengerSearchFilters();
    refreshAutocompleteLists();
  } catch {
    // Keep existing in-memory options if catalog fetch fails.
  }
}

function refreshAutocompleteLists() {
  refreshPassengerSearchFilters();
  const preferredFlights = state.passengerResults.length
    ? uniqueStrings(state.passengerResults.map((f) => f.flight_num))
    : knownFlightNumbers();
  updateSelect("passenger-book-flight", preferredFlights, "Select flight");
  updateSelect("passenger-book-seat", SEAT_SUGGESTIONS, "Select seat");
  updateSelect("passenger-cancel-ticket", knownTicketNumbers(), "Select ticket");

  updateSelect("agent-lookup-q", knownPassengerQueries(), "Select lookup query");
  updateSelect("agent-book-passenger", knownPassengerQueries(), "Select passenger");
  updateSelect("agent-book-flight", knownFlightNumbers(), "Select flight");
  updateSelect("agent-book-seat", SEAT_SUGGESTIONS, "Select seat");
  updateSelect("agent-refund-ticket", knownTicketNumbers(), "Select ticket");

  updateSelect("crew-status-flight", knownFlightNumbers(), "Select flight");
  updateSelect("crew-incident-tail", knownTailNumbers(), "Select tail_number");
  updateSelect("crew-incident-description", INCIDENT_DESCRIPTIONS, "Select description");

  updateSelect("admin-create-flight-num", suggestedNewFlightNumbers(), "Select flight_num");
  updateSelect("admin-create-tail", knownTailNumbers(), "Select tail_number");
  updateSelect("admin-create-origin", knownAirports(), "Select origin");
  updateSelect("admin-create-destination", knownAirports(), "Select destination");
  updateSelect("admin-create-depart", buildDateTimeOptions(14), "Select depart_time");
  updateSelect("admin-create-arrival", buildDateTimeOptions(14), "Select arrival_time");
  updateSelect("admin-create-gate", GATE_OPTIONS, "Select gate");
  updateSelect("admin-create-terminal", TERMINAL_OPTIONS, "Select terminal");
}

function normalizeDateTimeInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.replace("T", " ");
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:00`;
}

function buildDateOptions(daysAhead = 14) {
  const base = new Date();
  const out = [];
  for (let i = 0; i <= daysAhead; i += 1) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out.push(formatDateOnly(d));
  }
  return out;
}

function buildDateTimeOptions(daysAhead = 14) {
  const base = new Date();
  base.setMinutes(0, 0, 0);
  const out = [];
  for (let i = 0; i <= daysAhead; i += 1) {
    for (let h = 0; h < 24; h += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      d.setHours(h, 0, 0, 0);
      out.push(formatDateTime(d));
    }
  }
  return out;
}

function suggestedNewFlightNumbers(count = 80) {
  const known = knownFlightNumbers();
  const maxNum = known.reduce((max, code) => {
    const n = Number(String(code).replace(/[^0-9]/g, ""));
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const start = Math.max(maxNum + 1, 1);
  const generated = Array.from({ length: count }, (_unused, i) =>
    `F${String(start + i).padStart(5, "0")}`
  );
  return uniqueStrings([...generated, ...known]);
}

function buildPassengerQueryFallback(count = 180) {
  const out = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Wilson",
    "Moore"
  ];

  for (let n = 1; n <= count; n += 1) {
    const ssnA = `${String(n).padStart(3, "0")}-${String((n * 17) % 100).padStart(2, "0")}-${String(
      1000 + n
    ).padStart(4, "0")}`;
    const ssnB = `${String(900 + (n % 100)).padStart(3, "0")}-${String((n * 17) % 100).padStart(
      2,
      "0"
    )}-${String(4000 + n).padStart(4, "0")}`;
    out.push(ssnA, ssnB);
    out.push(`P${String(1000000 + n).padStart(7, "0")}`);
    out.push(`P${String(9000000 + n).padStart(7, "0")}`);
  }
  return uniqueStrings(out);
}

// Tries both query styles so this works with slightly different backends.
async function searchFlightsWithFallback(origin, destination, date) {
  const firstQuery = { origin, destination, date };
  try {
    return await apiRequest("GET", ENDPOINTS.searchFlights, { query: firstQuery });
  } catch (error) {
    if (!shouldRetryWithFromTo(error)) throw error;
    setStatus("Retrying with from/to params...", "info");
    return apiRequest("GET", ENDPOINTS.searchFlights, {
      query: { from: origin, to: destination, date }
    });
  }
}

function shouldRetryWithFromTo(error) {
  const text = `${error?.message || ""} ${safeString(error?.data)}`.toLowerCase();
  const hasFields =
    text.includes("origin") || text.includes("destination") || text.includes("from") || text.includes("to");
  const hasReason =
    text.includes("missing") || text.includes("required") || text.includes("invalid");
  return hasFields && hasReason;
}

function safeString(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

// Login view + submit handler.
function renderLoginPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Login</h2>
      <form id="login-form" class="stack">
        <label>Username <input name="username" required autocomplete="off"></label>
        <label>Password <input name="password" type="password" required></label>
        <button type="submit">Login</button>
      </form>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const username = String(fd.get("username") || "").trim();
    const password = String(fd.get("password") || "");

    try {
      const payload = await apiRequest("POST", ENDPOINTS.login, {
        body: { username, password }
      });

      const token = payload?.token || payload?.data?.token;
      const role = (payload?.role || payload?.data?.role || "").toLowerCase();
      if (!token || !role) {
        setStatus("Login response missing token/role.", "error");
        return;
      }
      saveAuth({
        token,
        role,
        name: payload?.name || payload?.data?.name || "",
        email: payload?.email || payload?.data?.email || ""
      });
      setStatus("Login successful.", "success");
      location.hash = ROLE_TO_ROUTE[role] || "#/login";
    } catch {
      // Error already handled in apiRequest.
    }
  });
}

// Passenger view and actions.
function renderPassengerPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Passenger Workspace</h2>
      <p class="muted">Search flights first, then book from the form below.</p>
    </section>
    <div class="page-grid">
      <section class="card">
        <h3>1) Search Flights</h3>
        <form id="passenger-search-form" class="grid-2">
          <label>Origin <select id="passenger-origin" name="origin"></select></label>
          <label>Destination <select id="passenger-destination" name="destination"></select></label>
          <label>Date (optional) <select id="passenger-date" name="date"></select></label>
          <div class="actions"><button type="submit">Search Flights</button></div>
        </form>
        <div id="passenger-results"></div>
      </section>

      <section class="card">
        <h3>2) Book Ticket</h3>
        <form id="passenger-book-form" class="grid-2">
          <label>flight_num <select id="passenger-book-flight" name="flight_num" required></select></label>
          <label>seat_num <select id="passenger-book-seat" name="seat_num" required></select></label>
          <label>
            class
            <select name="class" required>
              <option value="">Choose class</option>
              ${selectOptionsHtml(CABIN_CLASSES)}
            </select>
          </label>
          <div class="actions"><button type="submit">Book Ticket</button></div>
        </form>
        <p class="muted">Tip: click "Use" from search results to auto-fill flight number.</p>
      </section>
    </div>

    <section class="card">
      <div class="actions heading-row">
        <h3>3) My Tickets</h3>
        <button type="button" class="secondary" id="load-my-tickets">Refresh</button>
      </div>
      <form id="passenger-cancel-form" class="actions inline-form">
        <select id="passenger-cancel-ticket" name="ticket_num" required></select>
        <button type="submit" class="secondary">Cancel Selected Ticket</button>
      </form>
      <div id="my-tickets-table"></div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();
  refreshAutocompleteLists();

  document
    .getElementById("passenger-search-form")
    .addEventListener("submit", onPassengerSearch);
  document
    .getElementById("passenger-origin")
    .addEventListener("change", onPassengerSearchFilterChange);
  document
    .getElementById("passenger-destination")
    .addEventListener("change", onPassengerSearchFilterChange);
  document
    .getElementById("passenger-date")
    .addEventListener("change", onPassengerSearchFilterChange);
  document
    .getElementById("passenger-book-form")
    .addEventListener("submit", onPassengerBookTicket);
  document
    .getElementById("load-my-tickets")
    .addEventListener("click", loadPassengerTickets);
  document
    .getElementById("passenger-cancel-form")
    .addEventListener("submit", onPassengerCancelTicket);

  loadPassengerFlightCatalog();
  loadPassengerTickets();
}

async function onPassengerSearch(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const origin = String(fd.get("origin") || "").trim();
  const destination = String(fd.get("destination") || "").trim();
  const date = String(fd.get("date") || "").trim();

  try {
    const payload = await searchFlightsWithFallback(origin, destination, date);
    state.passengerResults = toArray(payload).map(normalizeFlight);
    refreshAutocompleteLists();
    renderPassengerResults();
    setStatus(`Found ${state.passengerResults.length} flights.`, "success");
  } catch {
    // Error already shown.
  }
}

async function onPassengerBookTicket(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const flightNum = String(fd.get("flight_num") || "").trim();
  const seatNum = String(fd.get("seat_num") || "").trim();
  const ticketClass = String(fd.get("class") || "").trim();
  if (!flightNum || !seatNum || !ticketClass) return;

  try {
    await apiRequest("POST", ENDPOINTS.passengerTickets, {
      body: {
        flight_num: flightNum,
        seat_num: seatNum,
        class: ticketClass
      }
    });
    setStatus("Ticket booked.", "success");
    event.currentTarget.reset();
    loadPassengerTickets();
  } catch {
    // Error already shown.
  }
}

async function onPassengerCancelTicket(event) {
  event.preventDefault();
  const ticketNum = String(new FormData(event.currentTarget).get("ticket_num") || "").trim();
  if (!ticketNum) return;

  try {
    await apiRequest("POST", ENDPOINTS.cancelTicket(ticketNum));
    setStatus(`Ticket ${ticketNum} cancelled.`, "success");
    event.currentTarget.reset();
    loadPassengerTickets();
  } catch {
    // Error already shown.
  }
}

function renderPassengerResults() {
  const host = document.getElementById("passenger-results");
  if (!host) return;

  if (!state.passengerResults.length) {
    host.innerHTML = "<p>No flights found.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>flight_num</th>
          <th>depart_time</th>
          <th>arrival_time</th>
          <th>origin</th>
          <th>destination</th>
          <th>status</th>
          <th>gate</th>
          <th>terminal</th>
          <th>Pick</th>
        </tr>
      </thead>
      <tbody>
        ${state.passengerResults
          .map(
            (f) => `
          <tr>
            <td>${escapeHtml(f.flight_num)}</td>
            <td>${escapeHtml(f.depart_time)}</td>
            <td>${escapeHtml(f.arrival_time)}</td>
            <td>${escapeHtml(f.origin)}</td>
            <td>${escapeHtml(f.destination)}</td>
            <td>${escapeHtml(f.status)}</td>
            <td>${escapeHtml(f.gate)}</td>
            <td>${escapeHtml(f.terminal)}</td>
            <td><button type="button" class="secondary" data-use-flight="${escapeHtml(f.flight_num)}">Use</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-use-flight]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flightNum = btn.dataset.useFlight || "";
      const bookForm = document.getElementById("passenger-book-form");
      if (!bookForm) return;
      const flightInput = bookForm.querySelector('select[name="flight_num"]');
      if (flightInput) {
        flightInput.value = flightNum;
        flightInput.focus();
      }
      setStatus(`Selected flight ${flightNum} for booking.`, "info");
    });
  });
}

async function loadPassengerTickets() {
  const host = document.getElementById("my-tickets-table");
  if (!host) return;
  try {
    const payload = await apiRequest("GET", ENDPOINTS.passengerTickets);
    state.passengerTickets = toArray(payload).map(normalizeTicket);
  } catch {
    state.passengerTickets = [];
  }
  refreshAutocompleteLists();

  if (!state.passengerTickets.length) {
    host.innerHTML = "<p>No tickets.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ticket_num</th>
          <th>flight_num</th>
          <th>seat_num</th>
          <th>class</th>
          <th>status</th>
          <th>date_booked</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${state.passengerTickets
          .map(
            (t) => `
          <tr>
            <td>${escapeHtml(t.ticket_num)}</td>
            <td>${escapeHtml(t.flight_num)}</td>
            <td>${escapeHtml(t.seat_num)}</td>
            <td>${escapeHtml(t.class)}</td>
            <td>${escapeHtml(t.status)}</td>
            <td>${escapeHtml(t.date_booked)}</td>
            <td><button data-cancel-ticket="${escapeHtml(t.ticket_num)}">Cancel</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-cancel-ticket]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ticketNum = btn.dataset.cancelTicket;
      try {
        await apiRequest("POST", ENDPOINTS.cancelTicket(ticketNum));
        setStatus(`Ticket ${ticketNum} cancelled.`, "success");
        loadPassengerTickets();
      } catch {
        // Error already shown.
      }
    });
  });
}

// Agent view and actions.
function renderAgentPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Agent Workspace</h2>
      <div class="page-grid">
        <section class="card slim-card">
          <h3>1) Passenger Lookup</h3>
          <form id="agent-lookup-form" class="actions">
            <select id="agent-lookup-q" name="q" required></select>
            <button type="submit">Lookup</button>
          </form>
          <div id="agent-passenger-table"></div>
        </section>

        <section class="card slim-card">
          <h3>2) Book for Passenger</h3>
          <form id="agent-book-form" class="grid-2">
            <label>passenger_query <select id="agent-book-passenger" name="passenger_query" required></select></label>
            <label>flight_num <select id="agent-book-flight" name="flight_num" required></select></label>
            <label>seat_num <select id="agent-book-seat" name="seat_num" required></select></label>
            <label>
              class
              <select name="class" required>
                <option value="">Choose class</option>
                ${selectOptionsHtml(CABIN_CLASSES)}
              </select>
            </label>
            <div class="actions"><button type="submit">Book Ticket</button></div>
          </form>

          <h3>3) Refund Ticket</h3>
          <form id="agent-refund-form" class="actions inline-form">
            <select id="agent-refund-ticket" name="ticket_num" required></select>
            <button type="submit" class="secondary">Refund</button>
          </form>
        </section>
      </div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();
  refreshAutocompleteLists();

  document
    .getElementById("agent-lookup-form")
    .addEventListener("submit", onAgentLookup);
  document
    .getElementById("agent-book-form")
    .addEventListener("submit", onAgentBook);
  document
    .getElementById("agent-refund-form")
    .addEventListener("submit", onAgentRefund);
}

async function onAgentLookup(event) {
  event.preventDefault();
  const q = String(new FormData(event.currentTarget).get("q") || "").trim();
  if (!q) return;

  try {
    const payload = await apiRequest("GET", ENDPOINTS.agentPassengerSearch, {
      query: { q }
    });
    state.agentPassengers = toArray(payload).map(normalizePassenger);
    refreshAutocompleteLists();
    renderAgentPassengerTable();
    setStatus(`Found ${state.agentPassengers.length} passengers.`, "success");
  } catch {
    // Error already shown.
  }
}

function renderAgentPassengerTable() {
  const host = document.getElementById("agent-passenger-table");
  if (!host) return;

  if (!state.agentPassengers.length) {
    host.innerHTML = "<p>No passengers found.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ssn</th>
          <th>first_name</th>
          <th>last_name</th>
          <th>passport_num</th>
          <th>email</th>
          <th>phone</th>
          <th>Pick</th>
        </tr>
      </thead>
      <tbody>
        ${state.agentPassengers
          .map(
            (p) => `
          <tr>
            <td>${escapeHtml(p.ssn)}</td>
            <td>${escapeHtml(p.first_name)}</td>
            <td>${escapeHtml(p.last_name)}</td>
            <td>${escapeHtml(p.passport_num)}</td>
            <td>${escapeHtml(p.email)}</td>
            <td>${escapeHtml(p.phone)}</td>
            <td><button type="button" class="secondary" data-use-passenger="${escapeHtml(p.ssn || p.email || `${p.first_name} ${p.last_name}`.trim())}">Use</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-use-passenger]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.usePassenger || "";
      const form = document.getElementById("agent-book-form");
      if (!form) return;
      const input = form.querySelector('select[name="passenger_query"]');
      if (input) {
        input.value = value;
        input.focus();
      }
      setStatus(`Selected passenger query "${value}".`, "info");
    });
  });
}

async function onAgentBook(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const passengerQuery = String(fd.get("passenger_query") || "").trim();
  const flightNum = String(fd.get("flight_num") || "").trim();
  const seatNum = String(fd.get("seat_num") || "").trim();
  const ticketClass = String(fd.get("class") || "").trim();
  if (!passengerQuery || !flightNum || !seatNum || !ticketClass) return;

  try {
    const payload = await apiRequest("POST", ENDPOINTS.agentTickets, {
      body: {
        passenger_query: passengerQuery,
        flight_num: flightNum,
        seat_num: seatNum,
        class: ticketClass
      }
    });
    const ticketNum = payload?.ticket_num || payload?.data?.ticket_num || "";
    if (ticketNum) {
      state.agentRecentTickets = uniqueStrings([...state.agentRecentTickets, ticketNum]);
      refreshAutocompleteLists();
    }
    setStatus("Agent booking created.", "success");
    event.currentTarget.reset();
  } catch {
    // Error already shown.
  }
}

async function onAgentRefund(event) {
  event.preventDefault();
  const ticketNum = String(new FormData(event.currentTarget).get("ticket_num") || "").trim();
  if (!ticketNum) return;
  try {
    await apiRequest("POST", ENDPOINTS.agentRefund(ticketNum));
    state.agentRecentTickets = uniqueStrings([...state.agentRecentTickets, ticketNum]);
    refreshAutocompleteLists();
    setStatus(`Refund requested for ${ticketNum}.`, "success");
    event.currentTarget.reset();
  } catch {
    // Error already shown.
  }
}

// Crew view and actions.
function renderCrewPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Crew Workspace</h2>
      <div class="page-grid">
        <section class="card slim-card">
          <h3>1) Schedule</h3>
          <div class="actions">
            <button id="crew-load-schedule" type="button">Load Schedule</button>
          </div>
          <form id="crew-status-form" class="grid-2">
            <label>flight_num <select id="crew-status-flight" name="flight_num" required></select></label>
            <label>
              status
              <select name="status" required>
                <option value="">Choose status</option>
                ${selectOptionsHtml(FLIGHT_STATUSES)}
              </select>
            </label>
            <div class="actions"><button type="submit">Update Status</button></div>
          </form>
          <div id="crew-schedule-table"></div>
        </section>

        <section class="card slim-card">
          <h3>2) Report Incident</h3>
          <form id="crew-incident-form" class="stack">
            <label>tail_number <select id="crew-incident-tail" name="tail_number" required></select></label>
            <label>description <select id="crew-incident-description" name="description" required></select></label>
            <button type="submit">Submit Incident</button>
          </form>
        </section>
      </div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();
  refreshAutocompleteLists();

  document
    .getElementById("crew-load-schedule")
    .addEventListener("click", loadCrewSchedule);
  document
    .getElementById("crew-status-form")
    .addEventListener("submit", onCrewStatusUpdate);
  document
    .getElementById("crew-incident-form")
    .addEventListener("submit", onCrewIncidentSubmit);
}

async function loadCrewSchedule() {
  const host = document.getElementById("crew-schedule-table");
  if (!host) return;
  try {
    const payload = await apiRequest("GET", ENDPOINTS.crewSchedule);
    state.crewSchedule = toArray(payload).map(normalizeFlight);
  } catch {
    state.crewSchedule = [];
  }
  refreshAutocompleteLists();

  if (!state.crewSchedule.length) {
    host.innerHTML = "<p>No schedule records.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>flight_num</th>
          <th>depart_time</th>
          <th>arrival_time</th>
          <th>origin</th>
          <th>destination</th>
          <th>status</th>
          <th>Pick</th>
        </tr>
      </thead>
      <tbody>
        ${state.crewSchedule
          .map(
            (f) => `
          <tr>
            <td>${escapeHtml(f.flight_num)}</td>
            <td>${escapeHtml(f.depart_time)}</td>
            <td>${escapeHtml(f.arrival_time)}</td>
            <td>${escapeHtml(f.origin)}</td>
            <td>${escapeHtml(f.destination)}</td>
            <td>${escapeHtml(f.status)}</td>
            <td><button type="button" class="secondary" data-use-flight="${escapeHtml(f.flight_num)}">Use</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-use-flight]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const flightNum = btn.dataset.useFlight || "";
      const form = document.getElementById("crew-status-form");
      if (!form) return;
      const input = form.querySelector('select[name="flight_num"]');
      if (input) {
        input.value = flightNum;
        input.focus();
      }
      setStatus(`Selected flight ${flightNum} for status update.`, "info");
    });
  });
}

async function onCrewStatusUpdate(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const flightNum = String(fd.get("flight_num") || "").trim();
  const status = String(fd.get("status") || "").trim();
  if (!flightNum || !status) return;

  try {
    await apiRequest("POST", ENDPOINTS.crewFlightStatus(flightNum), {
      body: { status }
    });
    setStatus(`Updated ${flightNum} to ${status}.`, "success");
    loadCrewSchedule();
  } catch {
    // Error already shown.
  }
}

async function onCrewIncidentSubmit(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const tailNumber = String(fd.get("tail_number") || "").trim();
  const description = String(fd.get("description") || "").trim();
  if (!tailNumber || !description) return;

  try {
    await apiRequest("POST", ENDPOINTS.crewIncidents, {
      body: {
        tail_number: tailNumber,
        description
      }
    });
    setStatus("Incident submitted.", "success");
    event.currentTarget.reset();
  } catch {
    // Error already shown.
  }
}

// Admin view and actions.
function renderAdminPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Admin Workspace</h2>
      <div class="page-grid">
        <section class="card slim-card">
          <h3>1) Create Flight</h3>
          <form id="admin-create-flight-form" class="grid-2">
            <label>flight_num <select id="admin-create-flight-num" name="flight_num" required></select></label>
            <label>tail_number <select id="admin-create-tail" name="tail_number" required></select></label>
            <label>origin <select id="admin-create-origin" name="origin" required></select></label>
            <label>destination <select id="admin-create-destination" name="destination" required></select></label>
            <label>depart_time <select id="admin-create-depart" name="depart_time" required></select></label>
            <label>arrival_time <select id="admin-create-arrival" name="arrival_time" required></select></label>
            <label>
              status
              <select name="status">
                <option value="SCHEDULED">SCHEDULED</option>
                ${selectOptionsHtml(FLIGHT_STATUSES.filter((s) => s !== "SCHEDULED"))}
              </select>
            </label>
            <label>gate <select id="admin-create-gate" name="gate"></select></label>
            <label>terminal <select id="admin-create-terminal" name="terminal"></select></label>
            <div class="actions"><button type="submit">Create Flight</button></div>
          </form>
        </section>

        <section class="card slim-card">
          <h3>2) Review Data</h3>
          <div class="actions">
            <button id="admin-load-flights" type="button">Load Flights</button>
            <button id="admin-load-aircraft" type="button" class="secondary">Load Aircraft</button>
          </div>
          <h4>Flights</h4>
          <div id="admin-flights-table"></div>
          <h4>Aircraft</h4>
          <div id="admin-aircraft-table"></div>
        </section>
      </div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();
  refreshAutocompleteLists();

  document
    .getElementById("admin-load-flights")
    .addEventListener("click", loadAdminFlights);
  document
    .getElementById("admin-load-aircraft")
    .addEventListener("click", loadAdminAircraft);
  document
    .getElementById("admin-create-flight-form")
    .addEventListener("submit", onAdminCreateFlight);

  loadAdminAircraft();
  loadAdminFlights();
}

async function loadAdminFlights() {
  const host = document.getElementById("admin-flights-table");
  if (!host) return;

  try {
    const payload = await apiRequest("GET", ENDPOINTS.adminFlights);
    state.adminFlights = toArray(payload).map(normalizeFlight);
  } catch {
    state.adminFlights = [];
  }
  refreshAutocompleteLists();

  if (!state.adminFlights.length) {
    host.innerHTML = "<p>No flights.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>flight_num</th>
          <th>depart_time</th>
          <th>arrival_time</th>
          <th>origin</th>
          <th>destination</th>
          <th>status</th>
          <th>gate</th>
          <th>terminal</th>
          <th>tail_number</th>
        </tr>
      </thead>
      <tbody>
        ${state.adminFlights
          .map(
            (f) => `
          <tr>
            <td>${escapeHtml(f.flight_num)}</td>
            <td>${escapeHtml(f.depart_time)}</td>
            <td>${escapeHtml(f.arrival_time)}</td>
            <td>${escapeHtml(f.origin)}</td>
            <td>${escapeHtml(f.destination)}</td>
            <td>${escapeHtml(f.status)}</td>
            <td>${escapeHtml(f.gate)}</td>
            <td>${escapeHtml(f.terminal)}</td>
            <td>${escapeHtml(f.tail_number)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function onAdminCreateFlight(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const flight_num = String(fd.get("flight_num") || "").trim();
  const depart_time = normalizeDateTimeInput(fd.get("depart_time"));
  const arrival_time = normalizeDateTimeInput(fd.get("arrival_time"));
  const origin = String(fd.get("origin") || "").trim();
  const destination = String(fd.get("destination") || "").trim();
  const status = String(fd.get("status") || "SCHEDULED").trim() || "SCHEDULED";
  const gate = String(fd.get("gate") || "").trim();
  const terminal = String(fd.get("terminal") || "").trim();
  const tail_number = String(fd.get("tail_number") || "").trim();
  if (!flight_num || !depart_time || !arrival_time || !origin || !destination || !tail_number) return;

  try {
    await apiRequest("POST", ENDPOINTS.adminFlights, {
      body: {
        flight_num,
        depart_time,
        arrival_time,
        origin,
        destination,
        status,
        gate,
        terminal,
        tail_number
      }
    });
    setStatus("Flight created.", "success");
    event.currentTarget.reset();
    loadAdminFlights();
  } catch {
    // Error already shown.
  }
}

async function loadAdminAircraft() {
  const host = document.getElementById("admin-aircraft-table");
  if (!host) return;

  let rows = [];
  try {
    const payload = await apiRequest("GET", ENDPOINTS.adminAircraft);
    rows = toArray(payload);
    state.adminAircraft = rows;
  } catch {
    state.adminAircraft = [];
  }
  refreshAutocompleteLists();

  if (!rows.length) {
    host.innerHTML = "<p>No aircraft records.</p>";
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>tail_number</th>
          <th>id</th>
          <th>model</th>
          <th>capacity</th>
          <th>status</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (a) => `
          <tr>
            <td>${escapeHtml(pick(a, ["tail_number", "tailNumber"]))}</td>
            <td>${escapeHtml(pick(a, ["id"]))}</td>
            <td>${escapeHtml(pick(a, ["model"]))}</td>
            <td>${escapeHtml(pick(a, ["capacity"]))}</td>
            <td>${escapeHtml(pick(a, ["status"]))}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}
