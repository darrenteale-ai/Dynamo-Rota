const express = require("express");
const { randomUUID } = require("crypto");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");
const { pushNotification } = require("../notify");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const isAdmin = req.user.role === "Manager";
  const rows = isAdmin
    ? db.prepare("SELECT id, from_staff_id AS fromStaffId, from_entry_id AS fromEntryId, to_staff_id AS toStaffId, to_entry_id AS toEntryId, note, status FROM swaps ORDER BY created_at DESC").all()
    : db.prepare("SELECT id, from_staff_id AS fromStaffId, from_entry_id AS fromEntryId, to_staff_id AS toStaffId, to_entry_id AS toEntryId, note, status FROM swaps WHERE from_staff_id = ? OR to_staff_id = ? ORDER BY created_at DESC").all(req.user.id, req.user.id);
  res.json(rows);
});

router.post("/", requireAuth, (req, res) => {
  const { fromEntryId, toStaffId, toEntryId, note } = req.body || {};
  const entry = db.prepare("SELECT * FROM entries WHERE id = ?").get(fromEntryId);
  if (!entry || entry.staff_id !== req.user.id) return res.status(400).json({ error: "That shift doesn't belong to you." });
  if (!toStaffId) return res.status(400).json({ error: "Choose a colleague to offer the swap to." });

  const id = randomUUID();
  db.prepare("INSERT INTO swaps (id, from_staff_id, from_entry_id, to_staff_id, to_entry_id, note, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_colleague', ?)")
    .run(id, req.user.id, fromEntryId, toStaffId, toEntryId || null, note || null, Date.now());
  pushNotification(toStaffId, `${req.user.name} proposed a shift swap with you.`);
  res.json({ id, status: "awaiting_colleague" });
});

router.patch("/:id/respond", requireAuth, (req, res) => {
  const { accept } = req.body || {};
  const swap = db.prepare("SELECT * FROM swaps WHERE id = ?").get(req.params.id);
  if (!swap) return res.status(404).json({ error: "Swap not found." });
  if (swap.to_staff_id !== req.user.id) return res.status(403).json({ error: "This offer isn't addressed to you." });
  if (swap.status !== "awaiting_colleague") return res.status(409).json({ error: "This offer has already moved on." });

  if (accept) {
    db.prepare("UPDATE swaps SET status = 'awaiting_manager' WHERE id = ?").run(req.params.id);
    pushNotification("role:Manager", `${req.user.name} agreed a shift swap — needs your approval.`);
  } else {
    db.prepare("UPDATE swaps SET status = 'declined' WHERE id = ?").run(req.params.id);
    pushNotification(swap.from_staff_id, `${req.user.name} declined your swap request.`);
  }
  res.json({ ok: true });
});

router.patch("/:id/decide", requireAuth, requireAdmin, (req, res) => {
  const { approve } = req.body || {};
  const swap = db.prepare("SELECT * FROM swaps WHERE id = ?").get(req.params.id);
  if (!swap) return res.status(404).json({ error: "Swap not found." });
  if (swap.status !== "awaiting_manager") return res.status(409).json({ error: "This swap isn't waiting for approval." });

  const tx = db.transaction(() => {
    if (approve) {
      db.prepare("UPDATE entries SET staff_id = ? WHERE id = ?").run(swap.to_staff_id, swap.from_entry_id);
      if (swap.to_entry_id) db.prepare("UPDATE entries SET staff_id = ? WHERE id = ?").run(swap.from_staff_id, swap.to_entry_id);
    }
    db.prepare("UPDATE swaps SET status = ? WHERE id = ?").run(approve ? "approved" : "declined", req.params.id);
  });
  tx();

  const text = `Your shift swap was ${approve ? "approved" : "declined"} by a manager.`;
  pushNotification(swap.from_staff_id, text);
  pushNotification(swap.to_staff_id, text);
  res.json({ ok: true });
});

module.exports = router;
