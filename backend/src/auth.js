const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET === "change-this-to-a-long-random-string") {
  console.warn(
    "WARNING: JWT_SECRET is missing or still the example value. Set a real random secret in your .env before deploying — tokens can be forged otherwise."
  );
}

function signToken(staff) {
  return jwt.sign({ sub: staff.id, role: staff.role, name: staff.name }, SECRET || "insecure-dev-secret", {
    expiresIn: "12h",
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    const payload = jwt.verify(token, SECRET || "insecure-dev-secret");
    req.user = { id: payload.sub, role: payload.role, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: "Your session has expired — please sign in again." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "Manager") return res.status(403).json({ error: "Managers only." });
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
