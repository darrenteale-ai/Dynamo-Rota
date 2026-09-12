require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const staffRoutes = require("./routes/staff");
const entriesRoutes = require("./routes/entries");
const patternsRoutes = require("./routes/patterns");
const requestsRoutes = require("./routes/requests");
const swapsRoutes = require("./routes/swaps");
const notificationsRoutes = require("./routes/notifications");
const settingsRoutes = require("./routes/settings");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim());

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/entries", entriesRoutes);
app.use("/api/patterns", patternsRoutes);
app.use("/api/requests", requestsRoutes);
app.use("/api/swaps", swapsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/settings", settingsRoutes);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Dynamo API listening on port ${PORT}`));
