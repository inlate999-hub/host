const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || "true") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendCodeEmail(toEmail, code, purpose) {
  const subject =
    purpose === "register"
      ? "Код подтверждения регистрации — inlateXDLC"
      : "Код входа в аккаунт — inlateXDLC";

  const html = `
    <div style="font-family:Arial,sans-serif;background:#0b0c11;padding:32px;color:#fff;">
      <h2 style="margin:0 0 12px;">inlateXDLC</h2>
      <p style="color:#aaa;margin:0 0 20px;">${
        purpose === "register" ? "Код для завершения регистрации:" : "Код для входа в аккаунт:"
      }</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#8da4f8;">${code}</div>
      <p style="color:#666;margin-top:24px;font-size:12px;">Код действует 10 минут. Если это были не вы — просто проигнорируйте письмо.</p>
    </div>`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject,
    html,
  });
}

module.exports = { sendCodeEmail };
