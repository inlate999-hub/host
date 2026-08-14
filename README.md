# inlateXDLC — бэкенд

Даёт фронтенду (`inlateXDLC.html`) три вещи, которые нельзя сделать в чистом HTML:
1. Регистрация/вход с кодом подтверждения на почту (SMTP)
2. Общий чат в реальном времени с никами и списком онлайна (WebSocket)
3. Оплата тарифа через ЮKassa с редиректом

## Установка

```bash
cd server
npm install
cp .env.example .env
```

Заполни `.env`:
- **SMTP_*** — данные почты, с которой будут уходить коды. Для Яндекс.Почты: создай пароль приложения в настройках Яндекс ID → «Пароли приложений» → «Почта».
- **YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY** — из личного кабинета ЮKassa (yookassa.ru → Настройки → API). Пока не пройдёшь модерацию магазина в ЮKassa, ключи будут тестовыми (`test_...`) — платежи будут не настоящими, это нормально для проверки.
- **JWT_SECRET** — любая длинная случайная строка: `openssl rand -hex 32`.
- **FRONTEND_URL** — адрес, на котором будет жить `inlateXDLC.html` (для CORS и возврата после оплаты).

Запуск:
```bash
npm start
```

По умолчанию сервер слушает `http://localhost:3001`.

## Как это работает

### Регистрация / вход (2FA по почте)
- `POST /api/auth/register` — принимает login/email/password, шлёт код на почту, ничего ещё не создаёт в базе.
- `POST /api/auth/register/confirm` — принимает email/code, если код верный — создаёт пользователя и выдаёт JWT-токен.
- `POST /api/auth/login` — проверяет пароль, если верный — шлёт код на почту.
- `POST /api/auth/login/confirm` — принимает email/code, выдаёт JWT-токен.

Токен фронт хранит и передаёт в заголовке `Authorization: Bearer <token>` для остальных запросов.

### Чат и онлайн
Подключение: `wss://твой-домен/ws/chat?token=<jwt>`.
Сервер держит список подключённых сокетов → при подключении/отключении рассылает всем актуальный список ников (`{type: "online", users: [...]}`). Сообщения хранятся в SQLite и рассылаются всем подключённым (`{type: "message", login, text}`).

### Оплата тарифа
- `POST /api/payments/create` (нужен токен) — тело `{ "tier": "week" | "month" | "forever" }`. Создаёт платёж в ЮKassa, возвращает `confirmationUrl` — фронт делает `window.location.href = confirmationUrl`, пользователь платит на стороне ЮKassa.
- `POST /api/payments/webhook` — сюда ЮKassa сама стучится, когда платёж прошёл. **Обязательно пропиши этот URL** в личном кабинете ЮKassa → Настройки → HTTP-уведомления → `https://твой-домен/api/payments/webhook`. Без этого тариф не активируется автоматически после оплаты.

## Хостинг
Нужен обычный VPS с Node.js (подойдёт любой: Timeweb, Reg.ru, Selectel и т.п.) — статичный HTML-хостинг (GitHub Pages, Netlify и т.п.) сюда не подходит, серверу нужно постоянно работать (WebSocket + SQLite-файл). Заведи `.env`, `npm install`, запусти через `pm2 start server.js` чтобы процесс жил после разрыва SSH, и повесь Nginx с HTTPS спереди (сертификат — Let's Encrypt/certbot). WebSocket через Nginx требует `proxy_set_header Upgrade $http_upgrade;` и `Connection "upgrade";` в конфиге.
