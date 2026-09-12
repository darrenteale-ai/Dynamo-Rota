const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

function visibleTo(row, user) {
  return row.staff_id === "all" || row.staff_id === user.id || (row.staff_id === "role:Manager" && user.role === "Manager");
}

router.get("/", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, staff_id AS staffId, text, ts, read_by AS readByJson FROM notifications ORDER BY ts DESC LIMIT 100").all();
  const mine = rows.filter((r) => visibleTo(r, req.user)).map((r) => ({ id: r.id, text: r.text, ts: r.ts, readBy: JSON.parse(r.readByJson) }));
  res.json(mine);
});

router.post("/mark-read", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT id, staff_id AS staffId, read_by AS readByJson FROM notifications").all();
  const update = db.prepare("UPDATE notifications SET read_by = ? WHERE id = ?");
  const tx = db.transaction(() => {
    rows.forEach((r) => {
      if (!visibleTo({ staff_id: r.staffId }, req.user)) return;
      const readBy = JSON.parse(r.readByJson);
      if (!readBy.includes(req.user.id)) {
        readBy.push(req.user.id);
        update.run(JSON.stringify(readBy), r.id);
      }
    });
  });
  tx();
  res.json({ ok: true });
});

module.exports = router;
