const { randomUUID } = require("crypto");
const db = require("./db");
const { sendEmail } = require("./email");

// staffId can be a specific staff id, 'all', or 'role:Manager'
function pushNotification(staffId, text) {
  const id = randomUUID();
  db.prepare("INSERT INTO notifications (id, staff_id, text, ts, read_by) VALUES (?, ?, ?, ?, '[]')").run(
    id, staffId, text, Date.now()
  );

  let recipients = [];
  if (staffId === "all") {
    recipients = db.prepare("SELECT email FROM staff WHERE email IS NOT NULL").all();
  } else if (staffId === "role:Manager") {
    recipients = db.prepare("SELECT email FROM staff WHERE role = 'Manager' AND email IS NOT NULL").all();
  } else {
    const s = db.prepare("SELECT email FROM staff WHERE id = ?").get(staffId);
    if (s?.email) recipients = [s];
  }
  recipients.forEach((r) => sendEmail(r.email, "Dynamo update", text));

  return id;
}

module.exports = { pushNotification };
