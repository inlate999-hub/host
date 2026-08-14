const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  hwid TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  tier TEXT,                 -- активный тариф: week | month | forever | NULL
  tier_expires_at INTEGER,   -- unix ms, NULL = бессрочно (forever) или нет тарифа
  telegram_id TEXT,
  is_email_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Одноразовые коды подтверждения (регистрация и вход)
CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,      -- 'register' | 'login'
  payload TEXT,               -- JSON с данными регистрации (login/password), пока код не подтверждён
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  login TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Открыт',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tier TEXT NOT NULL,
  amount TEXT NOT NULL,
  yookassa_payment_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | succeeded | canceled
  created_at INTEGER NOT NULL
);
`);

module.exports = db;
