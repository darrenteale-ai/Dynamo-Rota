const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { pushNotification } = require("../notify");

const router = express.Router();

function patternCodeFor(sequence, anchorIso, dateIso) {
  const anchor = new Date(anchorIso + "T00:00:00");
  const date = new Date(dateIso + "T00:00:00");
  const diffDays = Math.round((date - anchor) / 86400000);
  const len = sequence.length;
  const idx = ((diffDays % len) + len) % len;
  return sequence[idx];
}
function eachDate(fromIso, toIso) {
  const out = [];
  let cur = new Date(fromIso + "T00:00:00");
  const end = new Date(toIso + "T00:00:00");
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

router.get("/", requireAuth, (req, res) => {
  const { from, to } = req.query;
  let rows;
  if (from && to) {
    rows = db.prepare("SELECT id, staff_id AS staffId, date, shift, source FROM entries WHERE date BETWEEN ? AND ? ORDER BY date").all(from, to);
  } else {
    rows = db.prepare("SELECT id, staff_id AS staffId, date, shift, source FROM entries ORDER BY date").all();
  }
  res.json(rows);
});

router.post("/", requireAuth, requireAdmin, (req, res) => {
  const { staffId, date, shift } = req.body || {};
  if (!staffId || !date || !["day", "night"].includes(shift)) return res.status(400).json({ error: "staffId, date, and a valid shift are required." });
  const id = randomUUID();
  db.prepare("INSERT INTO entries (id, staff_id, date, shift, source, created_at) VALUES (?, ?, ?, ?, 'manual', ?)").run(id, staffId, date, shift, Date.now());
  res.json({ id, staffId, date, shift, source: "manual" });
});

router.delete("/:id", requireAuth, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM entries WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

router.post("/generate", requireAuth, requireAdmin, (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: "from and to dates are required." });

  const staffWithPatterns = db.prepare("SELECT id, pattern_id AS patternId, pattern_anchor AS patternAnchor FROM staff WHERE pattern_id IS NOT NULL AND pattern_anchor IS NOT NULL").all();
  const patterns = Object.fromEntries(db.prepare("SELECT id, sequence FROM patterns").all().map((p) => [p.id, JSON.parse(p.sequence)]));
  const dates = eachDate(from, to);
  const insert = db.prepare("INSERT INTO entries (id, staff_id, date, shift, source, created_at) VALUES (?, ?, ?, ?, 'pattern', ?)");
  const existing = db.prepare("SELECT staff_id AS staffId, date FROM entries WHERE date BETWEEN ? AND ?").all(from, to);
  const existingKey = new Set(existing.map((e) => `${e.staffId}|${e.date}`));

  let created = 0;
  const tx = db.transaction(() => {
    staffWithPatterns.forEach((s) => {
      const seq = patterns[s.patternId];
      if (!seq) return;
      dates.forEach((date) => {
        if (existingKey.has(`${s.id}|${date}`)) return;
        const code = patternCodeFor(seq, s.patternAnchor, date);
        if (code === "O") return;
        insert.run(randomUUID(), s.id, date, code === "D" ? "day" : "night", Date.now());
        created++;
      });
    });
  });
  tx();
  res.json({ created });
});

router.post("/publish", requireAuth, requireAdmin, (req, res) => {
  const { from, to } = req.body || {};
  if (!from || !to) return res.status(400).json({ error: "from and to dates are required." });
  const staffIds = db.prepare("SELECT DISTINCT staff_id AS staffId FROM entries WHERE date BETWEEN ? AND ?").all(from, to).map((r) => r.staffId);
  staffIds.forEach((id) => pushNotification(id, `Your shifts for ${from} to ${to} have been published.`));
  res.json({ notified: staffIds.length });
});

module.exports = router;
