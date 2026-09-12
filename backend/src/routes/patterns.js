const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, name, sequence FROM patterns").all();
  res.json(rows.map((r) => ({ ...r, sequence: JSON.parse(r.sequence) })));
});

router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { name, sequence } = req.body || {};
  if (!name?.trim() || !Array.isArray(sequence) || sequence.length === 0) {
    return res.status(400).json({ error: "A name and a non-empty sequence are required." });
  }
  const bad = sequence.some((c) => !["D", "N", "O"].includes(c));
  if (bad) return res.status(400).json({ error: "Sequence can only contain D, N, or O." });
  const id = randomUUID();
  db.prepare("INSERT INTO patterns (id, name, sequence) VALUES (?, ?, ?)").run(id, name.trim(), JSON.stringify(sequence));
  res.json({ id, name: name.trim(), sequence });
});

module.exports = router;
