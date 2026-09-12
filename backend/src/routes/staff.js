const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare(
    "SELECT id, name, role, email, contracted_hours AS contractedHours, password_hash IS NOT NULL AS hasPassword, pattern_id AS patternId, pattern_anchor AS patternAnchor FROM staff ORDER BY name"
  ).all();
  res.json(rows.map((r) => ({ ...r, hasPassword: !!r.hasPassword })));
});

router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, role, email } = req.body || {};
  if (!name?.trim() || !role) return res.status(400).json({ error: "Name and role are required." });
  const id = randomUUID();
  db.prepare(
    "INSERT INTO staff (id, name, role, email, contracted_hours, password_hash, pattern_id, pattern_anchor, created_at) VALUES (?, ?, ?, ?, 40, NULL, NULL, NULL, ?)"
  ).run(id, name.trim(), role, email || null, Date.now());
  res.json({ id, name: name.trim(), role, hasPassword: false });
});

router.patch("/:id/pattern", requireAuth, requireAdmin, (req, res) => {
  const { patternId, patternAnchor } = req.body || {};
  db.prepare("UPDATE staff SET pattern_id = ?, pattern_anchor = ? WHERE id = ?").run(patternId || null, patternAnchor || null, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
