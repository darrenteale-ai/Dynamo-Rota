const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { pushNotification } = require("../notify");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const isAdmin = req.user.role === "Manager";
  const rows = isAdmin
    ? db.prepare("SELECT id, staff_id AS staffId, type, from_date AS `from`, to_date AS `to`, reason, status FROM requests ORDER BY created_at DESC").all()
    : db.prepare("SELECT id, staff_id AS staffId, type, from_date AS `from`, to_date AS `to`, reason, status FROM requests WHERE staff_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(rows);
});

router.post("/", requireAuth, (req, res) => {
  const { type, from, to, reason } = req.body || {};
  if (!["leave", "change"].includes(type) || !from || !to || !reason?.trim()) {
    return res.status(400).json({ error: "type, from, to, and a reason are required." });
  }
  const id = randomUUID();
  db.prepare("INSERT INTO requests (id, staff_id, type, from_date, to_date, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)")
    .run(id, req.user.id, type, from, to, reason.trim(), Date.now());
  res.json({ id, staffId: req.user.id, type, from, to, reason: reason.trim(), status: "pending" });
});

router.patch("/:id", requireAuth, requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "declined"].includes(status)) return res.status(400).json({ error: "status must be approved or declined." });
  const request = db.prepare("SELECT * FROM requests WHERE id = ?").get(req.params.id);
  if (!request) return res.status(404).json({ error: "Request not found." });

  db.prepare("UPDATE requests SET status = ? WHERE id = ?").run(status, req.params.id);
  if (status === "approved" && request.type === "leave") {
    db.prepare("DELETE FROM entries WHERE staff_id = ? AND date BETWEEN ? AND ?").run(request.staff_id, request.from_date, request.to_date);
  }
  pushNotification(request.staff_id, `Your ${request.type === "leave" ? "leave" : "shift change"} request (${request.from_date} to ${request.to_date}) was ${status}.`);
  res.json({ ok: true });
});

module.exports = router;
