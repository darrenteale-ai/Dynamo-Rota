const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const Database = require("better-sqlite3");

const DB_PATH = process.env.DB_PATH || "./data/rota.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT,
    contracted_hours INTEGER DEFAULT 40,
    password_hash TEXT,
    pattern_id TEXT,
    pattern_anchor TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    date TEXT NOT NULL,
    shift TEXT NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
  CREATE INDEX IF NOT EXISTS idx_entries_staff ON entries(staff_id);

  CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sequence TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    type TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'pending',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS swaps (
    id TEXT PRIMARY KEY,
    from_staff_id TEXT NOT NULL,
    from_entry_id TEXT NOT NULL,
    to_staff_id TEXT NOT NULL,
    to_entry_id TEXT,
    note TEXT,
    status TEXT DEFAULT 'awaiting_colleague',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    text TEXT NOT NULL,
    ts INTEGER NOT NULL,
    read_by TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// default settings row if missing
const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'main'").get();
if (!settingsRow) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('main', ?)").run(
    JSON.stringify({ targetPerShift: 3, skillRules: [{ role: "Paramedic", min: 1 }] })
  );
}

// optional one-off demo seed, controlled by env var so it never silently re-runs in production
if (process.env.SEED_DEMO_DATA === "true") {
  const count = db.prepare("SELECT COUNT(*) AS n FROM staff").get().n;
  if (count === 0) {
    const seedStaff = [
      { name: "Priya Shah", role: "Manager" },
      { name: "Tom Whitfield", role: "Paramedic" },
      { name: "Aisha Begum", role: "Paramedic" },
      { name: "Marcus Reid", role: "EMT" },
      { name: "Elena Novak", role: "EMT" },
      { name: "Dan Osei", role: "Driver" },
      { name: "Grace Lin", role: "Paramedic" },
      { name: "Sam Okafor", role: "Control" },
    ];
    const insert = db.prepare(
      "INSERT INTO staff (id, name, role, email, contracted_hours, password_hash, pattern_id, pattern_anchor, created_at) VALUES (?, ?, ?, NULL, 40, NULL, NULL, NULL, ?)"
    );
    seedStaff.forEach((s) => insert.run(randomUUID(), s.name, s.role, Date.now()));

    db.prepare("INSERT INTO patterns (id, name, sequence) VALUES (?, ?, ?)").run(
      randomUUID(), "4 on 4 off (2 day / 2 night)", JSON.stringify(["D", "D", "N", "N", "O", "O", "O", "O"])
    );
    db.prepare("INSERT INTO patterns (id, name, sequence) VALUES (?, ?, ?)").run(
      randomUUID(), "Days only, 5 on 2 off", JSON.stringify(["D", "D", "D", "D", "D", "O", "O"])
    );
    console.log("Seeded demo staff and patterns. Set SEED_DEMO_DATA=false once you've reviewed them.");
  }
}

module.exports = db;
