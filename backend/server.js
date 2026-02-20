const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const DEFAULT_TICKET_PRICE = Number(process.env.DEFAULT_TICKET_PRICE || 199.0);

const dbConfig = {
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "airline",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

if (process.env.INSTANCE_CONNECTION_NAME) {
  dbConfig.socketPath = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
} else {
  dbConfig.host = process.env.DB_HOST || "127.0.0.1";
  dbConfig.port = Number(process.env.DB_PORT || 3306);
}

const pool = mysql.createPool(dbConfig);

app.use(express.json());
app.use(
  cors({
    origin(origin, cb) {
      if (CORS_ORIGIN === "*" || !origin) return cb(null, true);
      const allowed = CORS_ORIGIN.split(",").map((v) => v.trim());
      return cb(null, allowed.includes(origin));
    }
  })
);

const DEMO_USERS = loadDemoUsers();

app.get("/", (_req, res) => {
  res.json({ message: "Airline API is running." });
});

app.get("/health", async (_req, res, next) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/auth/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  if (!username || !password) {
    return res.status(400).json({ message: "username and password are required." });
  }

  const user = DEMO_USERS[username];
  if (!user || user.password !== password) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const payload = {
    sub: username,
    role: user.role,
    ssn: user.ssn || "",
    employee_id: user.employee_id || "",
    name: user.name || username,
    email: user.email || ""
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });

  return res.json({
    token,
    role: user.role,
    name: payload.name,
    email: payload.email
  });
});


app.post("/auth/register", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim();
  const role = String(req.body?.role || "").trim().toLowerCase();

  if (!username || !password || !name || !email || !role) {
    return res.status(400).json({ message: "username, password, name, email, and role are required." });
  }

  if (role === "admin") {
    return res.status(403).json({ message: "Cannot register as admin." });
  }

  if (!["passenger", "agent", "crew"].includes(role)) {
    return res.status(400).json({ message: "Invalid role. Must be passenger, agent, or crew." });
  }

  if (DEMO_USERS[username]) {
    return res.status(409).json({ message: "Username already exists." });
  }

  const newUser = {
    password,
    role,
    name,
    email
  };

  if (role === "passenger") {
    newUser.ssn = "";
  } else {
    newUser.employee_id = "";
  }

  DEMO_USERS[username] = newUser;

  return res.status(201).json({
    message: "Registration successful. You can now login.",
    username,
    role,
    name,
    email
  });
});


app.get("/flights/search", async (req, res, next) => {
  try {
    const origin = normalizeText(req.query.origin || req.query.from);
    const destination = normalizeText(req.query.destination || req.query.to);
    const date = normalizeText(req.query.date);

    let sql = `
      SELECT flight_num, depart_time, arrival_time, origin, destination, status, gate, terminal, tail_number
      FROM flight
      WHERE 1=1
    `;
    const params = [];

    if (origin) {
      sql += " AND origin = ?";
      params.push(origin);
    }
    if (destination) {
      sql += " AND destination = ?";
      params.push(destination);
    }
    if (date) {
      sql += " AND DATE(depart_time) = ?";
      params.push(date);
    }
    sql += " ORDER BY depart_time ASC";

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.get("/passenger/tickets", requireAuth, requireRole("passenger"), async (req, res, next) => {
  try {
    const passengerSsn = await resolvePassengerSsn(req.auth);
    const [rows] = await pool.query(
      `
        SELECT ticket_num, flight_num, seat_num, \`class\`, status, date_booked
        FROM ticket
        WHERE passenger_ssn = ?
        ORDER BY date_booked DESC, ticket_num DESC
      `,
      [passengerSsn]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/passenger/tickets", requireAuth, requireRole("passenger"), async (req, res, next) => {
  try {
    const passengerSsn = await resolvePassengerSsn(req.auth);
    const flightNum = normalizeText(req.body?.flight_num);
    const seatNum = normalizeText(req.body?.seat_num);
    const ticketClass = normalizeClass(req.body?.class);

    if (!flightNum || !seatNum || !ticketClass) {
      return res.status(400).json({ message: "flight_num, seat_num, and class are required." });
    }

    const ticketNum = buildTicketId();
    await pool.query(
      `
        INSERT INTO ticket (ticket_num, price, seat_num, \`class\`, date_booked, status, passenger_ssn, flight_num)
        VALUES (?, ?, ?, ?, CURDATE(), 'CONFIRMED', ?, ?)
      `,
      [ticketNum, DEFAULT_TICKET_PRICE, seatNum, ticketClass, passengerSsn, flightNum]
    );

    res.status(201).json({
      ticket_num: ticketNum,
      flight_num: flightNum,
      seat_num: seatNum,
      class: ticketClass,
      status: "CONFIRMED"
    });
  } catch (err) {
    next(err);
  }
});

app.post(
  "/passenger/tickets/:ticketNum/cancel",
  requireAuth,
  requireRole("passenger"),
  async (req, res, next) => {
    try {
      const passengerSsn = await resolvePassengerSsn(req.auth);
      const ticketNum = normalizeText(req.params.ticketNum);
      const [result] = await pool.query(
        `
          UPDATE ticket
          SET status = 'CANCELLED'
          WHERE ticket_num = ? AND passenger_ssn = ?
        `,
        [ticketNum, passengerSsn]
      );
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Ticket not found for this passenger." });
      }
      res.json({ message: "Ticket cancelled." });
    } catch (err) {
      next(err);
    }
  }
);

app.get(
  "/agent/passengers/search",
  requireAuth,
  requireRole("agent"),
  async (req, res, next) => {
    try {
      const q = normalizeText(req.query.q);
      if (!q) return res.json([]);

      const like = `%${q}%`;
      const [rows] = await pool.query(
        `
          SELECT p.ssn, pe.first_name, pe.last_name, p.passport_num, p.email, p.phone
          FROM passenger p
          JOIN person pe ON pe.ssn = p.ssn
          WHERE p.ssn = ?
             OR p.passport_num = ?
             OR p.email = ?
             OR pe.first_name LIKE ?
             OR pe.last_name LIKE ?
             OR CONCAT(pe.first_name, ' ', pe.last_name) LIKE ?
          ORDER BY pe.last_name, pe.first_name
          LIMIT 50
        `,
        [q, q, q, like, like, like]
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

app.post("/agent/tickets", requireAuth, requireRole("agent"), async (req, res, next) => {
  try {
    const passengerQuery = normalizeText(req.body?.passenger_query);
    const flightNum = normalizeText(req.body?.flight_num);
    const seatNum = normalizeText(req.body?.seat_num);
    const ticketClass = normalizeClass(req.body?.class);

    if (!passengerQuery || !flightNum || !seatNum || !ticketClass) {
      return res
        .status(400)
        .json({ message: "passenger_query, flight_num, seat_num, and class are required." });
    }

    const passengerSsn = await findPassengerByAgentQuery(passengerQuery);
    if (!passengerSsn) {
      return res.status(404).json({ message: "Passenger not found." });
    }

    const ticketNum = buildTicketId();
    await pool.query(
      `
        INSERT INTO ticket (ticket_num, price, seat_num, \`class\`, date_booked, status, passenger_ssn, flight_num)
        VALUES (?, ?, ?, ?, CURDATE(), 'CONFIRMED', ?, ?)
      `,
      [ticketNum, DEFAULT_TICKET_PRICE, seatNum, ticketClass, passengerSsn, flightNum]
    );

    res.status(201).json({
      ticket_num: ticketNum,
      passenger_ssn: passengerSsn,
      flight_num: flightNum,
      seat_num: seatNum,
      class: ticketClass,
      status: "CONFIRMED"
    });
  } catch (err) {
    next(err);
  }
});

app.post(
  "/agent/tickets/:ticketNum/refund",
  requireAuth,
  requireRole("agent"),
  async (req, res, next) => {
    try {
      const ticketNum = normalizeText(req.params.ticketNum);
      const [result] = await pool.query(
        "UPDATE ticket SET status = 'REFUNDED' WHERE ticket_num = ?",
        [ticketNum]
      );
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Ticket not found." });
      }
      res.json({ message: "Refund requested." });
    } catch (err) {
      next(err);
    }
  }
);

app.get("/crew/schedule", requireAuth, requireRole("crew"), async (req, res, next) => {
  try {
    const employeeId = normalizeText(req.auth.employee_id);

    if (!employeeId) {
      const [rows] = await pool.query(
        `
          SELECT flight_num, depart_time, arrival_time, origin, destination, status, gate, terminal, tail_number
          FROM flight
          ORDER BY depart_time ASC
        `
      );
      return res.json(rows);
    }

    const [rows] = await pool.query(
      `
        SELECT DISTINCT f.flight_num, f.depart_time, f.arrival_time, f.origin, f.destination, f.status, f.gate, f.terminal, f.tail_number
        FROM flight f
        WHERE f.flight_num IN (
          SELECT flight_num FROM pilot_of WHERE pilot_id = ?
          UNION
          SELECT flight_num FROM staff_of WHERE plane_host_id = ?
        )
        ORDER BY f.depart_time ASC
      `,
      [employeeId, employeeId]
    );
    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post(
  "/crew/flights/:flightNum/status",
  requireAuth,
  requireRole("crew"),
  async (req, res, next) => {
    try {
      const flightNum = normalizeText(req.params.flightNum);
      const status = normalizeText(req.body?.status);
      if (!status) return res.status(400).json({ message: "status is required." });

      const [result] = await pool.query("UPDATE flight SET status = ? WHERE flight_num = ?", [
        status,
        flightNum
      ]);
      if (!result.affectedRows) {
        return res.status(404).json({ message: "Flight not found." });
      }

      res.json({ message: "Flight status updated." });
    } catch (err) {
      next(err);
    }
  }
);

app.post("/crew/incidents", requireAuth, requireRole("crew"), async (req, res, next) => {
  try {
    const tailNumber = normalizeText(req.body?.tail_number);
    const description = normalizeText(req.body?.description);
    if (!tailNumber || !description) {
      return res.status(400).json({ message: "tail_number and description are required." });
    }

    const incidentNum = buildIncidentId();
    await pool.query(
      `
        INSERT INTO incident (incident_num, time_occurred, description, tail_number)
        VALUES (?, NOW(), ?, ?)
      `,
      [incidentNum, description, tailNumber]
    );

    res.status(201).json({ incident_num: incidentNum, message: "Incident submitted." });
  } catch (err) {
    next(err);
  }
});

app.get("/admin/flights", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
        SELECT flight_num, depart_time, arrival_time, origin, destination, status, gate, terminal, tail_number
        FROM flight
        ORDER BY depart_time ASC
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.post("/admin/flights", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const flightNum = normalizeText(req.body?.flight_num);
    const departTime = normalizeText(req.body?.depart_time);
    const arrivalTime = normalizeText(req.body?.arrival_time);
    const origin = normalizeText(req.body?.origin);
    const destination = normalizeText(req.body?.destination);
    const status = normalizeText(req.body?.status) || "SCHEDULED";
    const gate = normalizeText(req.body?.gate) || null;
    const terminal = normalizeText(req.body?.terminal) || null;
    const tailNumber = normalizeText(req.body?.tail_number);

    if (!flightNum || !departTime || !arrivalTime || !origin || !destination || !tailNumber) {
      return res.status(400).json({
        message:
          "flight_num, depart_time, arrival_time, origin, destination, and tail_number are required."
      });
    }

    await pool.query(
      `
        INSERT INTO flight (flight_num, depart_time, arrival_time, origin, destination, status, gate, terminal, tail_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [flightNum, departTime, arrivalTime, origin, destination, status, gate, terminal, tailNumber]
    );

    res.status(201).json({ message: "Flight created.", flight_num: flightNum });
  } catch (err) {
    next(err);
  }
});

app.get("/admin/aircraft", requireAuth, requireRole("admin"), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT tail_number, id, model, capacity, status FROM aircraft ORDER BY tail_number ASC"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ message: "Duplicate value violates a unique constraint." });
  }
  if (err.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({ message: "Related record does not exist." });
  }
  if (err.code === "ER_CHECK_CONSTRAINT_VIOLATED") {
    return res.status(400).json({ message: "Constraint check failed." });
  }

  const status = Number(err.status || 500);
  const message =
    status < 500 ? err.message || "Request failed." : "Unexpected server error. Check logs.";
  if (status >= 500) {
    console.error(err);
  }
  return res.status(status).json({ message });
});

app.listen(PORT, async () => {
  try {
    await pool.query("SELECT 1");
    console.log(`Airline API listening on port ${PORT}`);
  } catch (err) {
    console.error("Database check failed at startup:", err.message);
    console.log(`Airline API listening on port ${PORT} (DB not reachable yet)`);
  }
});

function requireAuth(req, res, next) {
  const raw = req.headers.authorization || "";
  const [scheme, token] = raw.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header." });
  }

  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = String(req.auth?.role || "").toLowerCase();
    if (!roles.includes(role)) {
      return res.status(403).json({ message: "Forbidden for this role." });
    }
    return next();
  };
}

async function resolvePassengerSsn(auth) {
  const tokenSsn = normalizeText(auth?.ssn);
  if (tokenSsn) return tokenSsn;

  const tokenEmail = normalizeText(auth?.email);
  if (!tokenEmail) {
    const err = new Error("Passenger identity missing in token.");
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.query("SELECT ssn FROM passenger WHERE email = ? LIMIT 1", [tokenEmail]);
  if (!rows.length) {
    const err = new Error("Passenger profile not found.");
    err.status = 404;
    throw err;
  }
  return rows[0].ssn;
}

async function findPassengerByAgentQuery(query) {
  const like = `%${query}%`;
  const [rows] = await pool.query(
    `
      SELECT p.ssn
      FROM passenger p
      JOIN person pe ON pe.ssn = p.ssn
      WHERE p.ssn = ?
         OR p.passport_num = ?
         OR p.email = ?
         OR pe.first_name LIKE ?
         OR pe.last_name LIKE ?
         OR CONCAT(pe.first_name, ' ', pe.last_name) LIKE ?
      ORDER BY pe.last_name, pe.first_name
      LIMIT 1
    `,
    [query, query, query, like, like, like]
  );
  return rows[0]?.ssn || "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeClass(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (normalized === "ECONOMY" || normalized === "BUSINESS" || normalized === "FIRST") {
    return normalized;
  }
  return "";
}

function buildTicketId() {
  return `T${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function buildIncidentId() {
  return `I${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0")}`;
}

function loadDemoUsers() {
  if (process.env.DEMO_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.DEMO_USERS_JSON);
      if (parsed && typeof parsed === "object") return parsed;
    } catch (err) {
      console.warn("Failed to parse DEMO_USERS_JSON. Falling back to defaults.", err.message);
    }
  }

  return {
    passenger: {
      password: "pass123",
      role: "passenger",
      ssn: process.env.DEMO_PASSENGER_SSN || "",
      email: process.env.DEMO_PASSENGER_EMAIL || "",
      name: "Passenger User"
    },
    agent: {
      password: "agent123",
      role: "agent",
      employee_id: process.env.DEMO_AGENT_ID || "",
      name: "Agent User"
    },
    crew: {
      password: "crew123",
      role: "crew",
      employee_id: process.env.DEMO_CREW_ID || "",
      name: "Crew User"
    },
    admin: {
      password: "admin123",
      role: "admin",
      employee_id: process.env.DEMO_ADMIN_ID || "",
      name: "Admin User"
    }
  };
}
