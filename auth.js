const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("./db");
const { sendCodeEmail } = require("./mail");

const router = express.Router();
const CODE_TTL_MS = 10 * 60 * 1000; // 10 минут

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function signToken(user) {
  return jwt.sign(
    { uid: user.id, login: user.login, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function publicUser(u) {
  return {
    id: u.id,
    login: u.login,
    email: u.email,
    role: u.role,
    hwid: u.hwid,
    tier: u.tier,
    tierExpiresAt: u.tier_expires_at,
    telegramId: u.telegram_id,
    createdAt: u.created_at,
  };
}

// Middleware — проверка JWT из заголовка Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Нет токена авторизации" });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Токен недействителен или истёк" });
  }
}

// ---------- РЕГИСТРАЦИЯ: шаг 1 — отправить код ----------
router.post("/register", async (req, res) => {
  const { login, email, password } = req.body || {};
  if (!login || !email || !password || !email.includes("@")) {
    return res.status(400).json({ error: "Заполните логин, почту и пароль корректно" });
  }

  const exists = db
    .prepare("SELECT id FROM users WHERE email = ? OR login = ?")
    .get(email, login);
  if (exists) {
    return res.status(409).json({ error: "Логин или почта уже заняты" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const code = genCode();

  db.prepare(
    `INSERT INTO email_codes (email, code, purpose, payload, expires_at, created_at)
     VALUES (?, ?, 'register', ?, ?, ?)`
  ).run(
    email,
    code,
    JSON.stringify({ login, email, passwordHash }),
    Date.now() + CODE_TTL_MS,
    Date.now()
  );

  try {
    await sendCodeEmail(email, code, "register");
  } catch (e) {
    console.error("Ошибка отправки письма:", e.message);
    return res.status(500).json({ error: "Не удалось отправить письмо. Проверьте SMTP-настройки на сервере." });
  }

  res.json({ ok: true });
});

// ---------- РЕГИСТРАЦИЯ: шаг 2 — подтвердить код и создать аккаунт ----------
router.post("/register/confirm", (req, res) => {
  const { email, code } = req.body || {};
  const row = db
    .prepare(
      `SELECT * FROM email_codes WHERE email = ? AND code = ? AND purpose = 'register' AND used = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(email, code);

  if (!row) return res.status(400).json({ error: "Неверный код" });
  if (row.expires_at < Date.now()) return res.status(400).json({ error: "Код истёк, запросите новый" });

  const payload = JSON.parse(row.payload);
  const info = db
    .prepare(
      `INSERT INTO users (login, email, password_hash, role, is_email_verified, created_at)
       VALUES (?, ?, ?, 'user', 1, ?)`
    )
    .run(payload.login, payload.email, payload.passwordHash, Date.now());

  db.prepare("UPDATE email_codes SET used = 1 WHERE id = ?").run(row.id);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.json({ token: signToken(user), user: publicUser(user) });
});

// ---------- ВХОД: шаг 1 — проверить пароль, отправить код ----------
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(401).json({ error: "Неверная почта или пароль" });

  const ok = await bcrypt.compare(password || "", user.password_hash);
  if (!ok) return res.status(401).json({ error: "Неверная почта или пароль" });

  const code = genCode();
  db.prepare(
    `INSERT INTO email_codes (email, code, purpose, expires_at, created_at)
     VALUES (?, ?, 'login', ?, ?)`
  ).run(email, code, Date.now() + CODE_TTL_MS, Date.now());

  try {
    await sendCodeEmail(email, code, "login");
  } catch (e) {
    console.error("Ошибка отправки письма:", e.message);
    return res.status(500).json({ error: "Не удалось отправить письмо. Проверьте SMTP-настройки на сервере." });
  }

  res.json({ ok: true });
});

// ---------- ВХОД: шаг 2 — подтвердить код, выдать токен ----------
router.post("/login/confirm", (req, res) => {
  const { email, code } = req.body || {};
  const row = db
    .prepare(
      `SELECT * FROM email_codes WHERE email = ? AND code = ? AND purpose = 'login' AND used = 0
       ORDER BY id DESC LIMIT 1`
    )
    .get(email, code);

  if (!row) return res.status(400).json({ error: "Неверный код" });
  if (row.expires_at < Date.now()) return res.status(400).json({ error: "Код истёк, запросите новый" });

  db.prepare("UPDATE email_codes SET used = 1 WHERE id = ?").run(row.id);

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.uid);
  if (!user) return res.status(404).json({ error: "Пользователь не найден" });
  res.json({ user: publicUser(user) });
});

module.exports = { router, requireAuth, publicUser };
