const express = require("express");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");
const db = require("../db");
const { signToken, requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

// Public: list staff names/roles so the sign-in screen can show who to pick. No secrets exposed.
router.get("/staff", (req, res) => {
  const rows = db.prepare("SELECT id, name, role, password_hash IS NOT NULL AS hasPassword FROM staff ORDER BY name").all();
  res.json(rows.map((r) => ({ id: r.id, name: r.name, role: r.role, hasPassword: !!r.hasPassword })));
});

// Self-service join. In a real deployment you may want to lock this behind an admin invite instead —
// see the README for how to disable open registration.
router.post("/register", (req, res) => {
  const { name, role, password, email } = req.body || {};
  if (!name?.trim() || !role || !password || password.length < 8) {
    return res.status(400).json({ error: "Name, role, and a password of at least 8 characters are required." });
  }
  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO staff (id, name, role, email, contracted_hours, password_hash, pattern_id, pattern_anchor, created_at) VALUES (?, ?, ?, ?, 40, ?, NULL, NULL, ?)"
  ).run(id, name.trim(), role, email || null, passwordHash, Date.now());
  const staff = { id, role, name: name.trim() };
  res.json({ token: signToken(staff), staff: { id, name: name.trim(), role } });
});

// First-time password set for an existing staff record that has none yet (seeded or admin-added staff).
router.post("/set-password", (req, res) => {
  const { staffId, password } = req.body || {};
  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(staffId);
  if (!staff) return res.status(404).json({ error: "Unknown staff member." });
  if (staff.password_hash) return res.status(409).json({ error: "A password is already set — sign in instead." });
  if (!password || password.length < 8) return res.status(400).json({ error: "Use a password of at least 8 characters." });
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE staff SET password_hash = ? WHERE id = ?").run(passwordHash, staffId);
  res.json({ token: signToken(staff), staff: { id: staff.id, name: staff.name, role: staff.role } });
});

router.post("/login", (req, res) => {
  const { staffId, password } = req.body || {};
  const staff = db.prepare("SELECT * FROM staff WHERE id = ?").get(staffId);
  if (!staff || !staff.password_hash) return res.status(401).json({ error: "Incorrect sign-in details." });
  if (!bcrypt.compareSync(password || "", staff.password_hash)) {
    return res.status(401).json({ error: "Wrong password." });
  }
  res.json({ token: signToken(staff), staff: { id: staff.id, name: staff.name, role: staff.role } });
});

router.get("/me", requireAuth, (req, res) => {
  const staff = db.prepare("SELECT id, name, role, pattern_id AS patternId, pattern_anchor AS patternAnchor FROM staff WHERE id = ?").get(req.user.id);
  if (!staff) return res.status(404).json({ error: "Account no longer exists." });
  res.json(staff);
});

router.post("/reset-password/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("UPDATE staff SET password_hash = NULL WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
