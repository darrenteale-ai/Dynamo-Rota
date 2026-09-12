const nodemailer = require("nodemailer");

const enabled = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = enabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

// Fire-and-forget: notification flow should never fail because email did.
async function sendEmail(to, subject, text) {
  if (!enabled || !to) return;
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
  } catch (err) {
    console.error("Email send failed (notification still recorded in-app):", err.message);
  }
}

module.exports = { sendEmail, emailEnabled: enabled };
