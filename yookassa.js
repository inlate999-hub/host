const fetch = require("node-fetch");
const crypto = require("crypto");

const API_URL = "https://api.yookassa.ru/v3/payments";

function authHeader() {
  const token = Buffer.from(
    `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`
  ).toString("base64");
  return `Basic ${token}`;
}

// Создаёт платёж и возвращает confirmation_url, на который редиректим пользователя
async function createPayment({ amountRub, description, userId, tier, returnUrl }) {
  const idempotenceKey = crypto.randomUUID();

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      amount: { value: Number(amountRub).toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      description,
      metadata: { userId: String(userId), tier },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.description || "Ошибка создания платежа в ЮKassa");
  }
  return data; // содержит id, confirmation.confirmation_url, status
}

// Проверка статуса конкретного платежа (используем в вебхуке для верификации)
async function getPayment(paymentId) {
  const res = await fetch(`${API_URL}/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  return res.json();
}

module.exports = { createPayment, getPayment };
