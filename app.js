// Change this to your group server URL.
const BASE_URL = "http://localhost:3000";

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

// Values shown in the debug panel.
const debugState = {
  lastUrl: "-",
  lastError: "-"
};

// In-memory UI data by feature/role.
const state = {
  passengerResults: [],
  passengerTickets: [],
  agentPassengers: [],
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
        <label>Username <input name="username" required></label>
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
      <h2>Passenger</h2>
      <form id="passenger-search-form" class="grid-2">
        <label>Origin <input name="origin" placeholder="MSY"></label>
        <label>Destination <input name="destination" placeholder="ATL"></label>
        <label>Date (optional) <input name="date" type="date"></label>
        <div class="actions"><button type="submit">Search Flights</button></div>
      </form>
      <div id="passenger-results"></div>
    </section>

    <section class="card">
      <div class="actions">
        <h3>My Tickets</h3>
        <button type="button" class="secondary" id="load-my-tickets">Refresh</button>
      </div>
      <div id="my-tickets-table"></div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();

  document
    .getElementById("passenger-search-form")
    .addEventListener("submit", onPassengerSearch);
  document
    .getElementById("load-my-tickets")
    .addEventListener("click", loadPassengerTickets);

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
    renderPassengerResults();
    setStatus(`Found ${state.passengerResults.length} flights.`, "success");
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
          <th>Action</th>
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
            <td><button data-book-flight="${escapeHtml(f.flight_num)}">Book</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-book-flight]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flightNum = btn.dataset.bookFlight;
      const seatNum = prompt("seat_num?");
      if (!seatNum) return;
      const ticketClass = prompt("class? (Economy/Business/etc)");
      if (!ticketClass) return;

      try {
        await apiRequest("POST", ENDPOINTS.passengerTickets, {
          body: {
            flight_num: flightNum,
            seat_num: seatNum,
            class: ticketClass
          }
        });
        setStatus("Ticket booked.", "success");
        loadPassengerTickets();
      } catch {
        // Error already shown.
      }
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
      <h2>Agent</h2>
      <form id="agent-lookup-form" class="actions">
        <input name="q" placeholder="Passenger lookup query (name/ssn/email)" required>
        <button type="submit">Lookup</button>
      </form>
      <div id="agent-passenger-table"></div>
    </section>

    <section class="card">
      <h3>Book for Passenger</h3>
      <form id="agent-book-form" class="grid-2">
        <label>passenger_query <input name="passenger_query" required></label>
        <label>flight_num <input name="flight_num" required></label>
        <div class="actions"><button type="submit">Book</button></div>
      </form>
    </section>

    <section class="card">
      <h3>Refund</h3>
      <button id="agent-refund-btn" type="button">Refund by ticket_num</button>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();

  document
    .getElementById("agent-lookup-form")
    .addEventListener("submit", onAgentLookup);
  document
    .getElementById("agent-book-form")
    .addEventListener("submit", onAgentBook);
  document
    .getElementById("agent-refund-btn")
    .addEventListener("click", onAgentRefund);
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
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

async function onAgentBook(event) {
  event.preventDefault();
  const fd = new FormData(event.currentTarget);
  const passengerQuery = String(fd.get("passenger_query") || "").trim();
  const flightNum = String(fd.get("flight_num") || "").trim();
  if (!passengerQuery || !flightNum) return;

  const seatNum = prompt("seat_num?");
  if (!seatNum) return;
  const ticketClass = prompt("class?");
  if (!ticketClass) return;

  try {
    await apiRequest("POST", ENDPOINTS.agentTickets, {
      body: {
        passenger_query: passengerQuery,
        flight_num: flightNum,
        seat_num: seatNum,
        class: ticketClass
      }
    });
    setStatus("Agent booking created.", "success");
    event.currentTarget.reset();
  } catch {
    // Error already shown.
  }
}

async function onAgentRefund() {
  const ticketNum = prompt("ticket_num to refund?");
  if (!ticketNum) return;
  try {
    await apiRequest("POST", ENDPOINTS.agentRefund(ticketNum));
    setStatus(`Refund requested for ${ticketNum}.`, "success");
  } catch {
    // Error already shown.
  }
}

// Crew view and actions.
function renderCrewPage() {
  appEl.innerHTML = `
    <section class="card">
      <h2>Crew</h2>
      <button id="crew-load-schedule" type="button">Load Schedule</button>
      <div id="crew-schedule-table"></div>
    </section>

    <section class="card">
      <h3>Report Incident</h3>
      <form id="crew-incident-form" class="stack">
        <label>tail_number <input name="tail_number" required></label>
        <label>description <textarea name="description" rows="3" required></textarea></label>
        <button type="submit">Submit Incident</button>
      </form>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();

  document
    .getElementById("crew-load-schedule")
    .addEventListener("click", loadCrewSchedule);
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
          <th>Action</th>
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
            <td><button data-update-flight="${escapeHtml(f.flight_num)}">Update Status</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  host.querySelectorAll("button[data-update-flight]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const flightNum = btn.dataset.updateFlight;
      const status = prompt("New status?");
      if (!status) return;
      try {
        await apiRequest("POST", ENDPOINTS.crewFlightStatus(flightNum), {
          body: { status }
        });
        setStatus(`Updated ${flightNum} to ${status}.`, "success");
        loadCrewSchedule();
      } catch {
        // Error already shown.
      }
    });
  });
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
      <h2>Admin</h2>
      <div class="actions">
        <button id="admin-load-flights" type="button">Load Flights</button>
        <button id="admin-create-flight" type="button">Create Flight</button>
      </div>
      <div id="admin-flights-table"></div>
    </section>

    <section class="card">
      <div class="actions">
        <button id="admin-load-aircraft" type="button">Load Aircraft</button>
      </div>
      <div id="admin-aircraft-table"></div>
    </section>
    ${debugPanelHtml()}
  `;
  refreshDebugPanel();

  document
    .getElementById("admin-load-flights")
    .addEventListener("click", loadAdminFlights);
  document
    .getElementById("admin-create-flight")
    .addEventListener("click", onAdminCreateFlight);
  document
    .getElementById("admin-load-aircraft")
    .addEventListener("click", loadAdminAircraft);
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

async function onAdminCreateFlight() {
  const flight_num = prompt("flight_num?");
  if (!flight_num) return;
  const depart_time = prompt("depart_time? (YYYY-MM-DD HH:MM:SS)");
  if (!depart_time) return;
  const arrival_time = prompt("arrival_time? (YYYY-MM-DD HH:MM:SS)");
  if (!arrival_time) return;
  const origin = prompt("origin?");
  if (!origin) return;
  const destination = prompt("destination?");
  if (!destination) return;
  const status = prompt("status?") || "";
  const gate = prompt("gate?") || "";
  const terminal = prompt("terminal?") || "";
  const tail_number = prompt("tail_number?");
  if (!tail_number) return;

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
