const express = require("express");
const db = require("../db");
const { requireAuth, requireAdmin } = require("../auth");

const router = express.Router();

router.get("/", requireAuth, (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'main'").get();
  res.json(JSON.parse(row.value));
});

router.patch("/", requireAuth, requireAdmin, (req, res) => {
  const current = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'main'").get().value);
  const next = { ...current, ...req.body };
  db.prepare("UPDATE settings SET value = ? WHERE key = 'main'").run(JSON.stringify(next));
  res.json(next);
});

module.exports = router;
