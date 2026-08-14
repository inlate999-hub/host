const express = require("express");
const db = require("./db");
const { createPayment, getPayment } = require("./yookassa");
const { requireAuth } = require("./auth");

const router = express.Router();

// Должно совпадать с TIERS во фронтенде
const TIERS = {
  week: { amount: 150, days: 7, name: "Неделя" },
  month: { amount: 300, days: 30, name: "Месяц" },
  forever: { amount: 999, days: null, name: "Навсегда" },
};

// ---------- Создать платёж и получить ссылку на оплату ----------
router.post("/create", requireAuth, async (req, res) => {
  const { tier } = req.body || {};
  const plan = TIERS[tier];
  if (!plan) return res.status(400).json({ error: "Неизвестный тариф" });

  try {
    const payment = await createPayment({
      amountRub: plan.amount,
      description: `inlateXDLC — тариф «${plan.name}»`,
      userId: req.auth.uid,
      tier,
      returnUrl: `${process.env.FRONTEND_URL}/?payment=done`,
    });

    db.prepare(
      `INSERT INTO payments (user_id, tier, amount, yookassa_payment_id, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`
    ).run(req.auth.uid, tier, String(plan.amount), payment.id, Date.now());

    res.json({ confirmationUrl: payment.confirmation.confirmation_url });
  } catch (e) {
    console.error("Ошибка создания платежа:", e.message);
    res.status(500).json({ error: "Не удалось создать платёж. Проверьте ключи ЮKassa на сервере." });
  }
});

// ---------- Вебхук от ЮKassa: приходит при смене статуса платежа ----------
// Настраивается в личном кабинете ЮKassa -> HTTP-уведомления -> этот URL
router.post("/webhook", express.json(), async (req, res) => {
  const event = req.body;
  const paymentId = event?.object?.id;
  if (!paymentId) return res.sendStatus(400);

  // Не доверяем телу вебхука напрямую — перепроверяем платёж через API ЮKassa
  const verified = await getPayment(paymentId);

  const row = db.prepare("SELECT * FROM payments WHERE yookassa_payment_id = ?").get(paymentId);
  if (!row) return res.sendStatus(200); // платёж не наш — просто отвечаем 200

  if (verified.status === "succeeded" && row.status !== "succeeded") {
    db.prepare("UPDATE payments SET status = 'succeeded' WHERE id = ?").run(row.id);

    const plan = TIERS[row.tier];
    const expiresAt = plan.days ? Date.now() + plan.days * 86400000 : null;
    db.prepare("UPDATE users SET tier = ?, tier_expires_at = ? WHERE id = ?").run(
      row.tier,
      expiresAt,
      row.user_id
    );
  } else if (verified.status === "canceled") {
    db.prepare("UPDATE payments SET status = 'canceled' WHERE id = ?").run(row.id);
  }

  res.sendStatus(200);
});

// ---------- Статус последнего платежа пользователя (фронт может опрашивать после возврата) ----------
router.get("/status", requireAuth, (req, res) => {
  const row = db
    .prepare("SELECT * FROM payments WHERE user_id = ? ORDER BY id DESC LIMIT 1")
    .get(req.auth.uid);
  res.json({ payment: row || null });
});

module.exports = router;
