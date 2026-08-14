const { WebSocketServer } = require("ws");
const jwt = require("jsonwebtoken");
const db = require("./db");

// clients: Map<ws, { userId, login }>
function attachChat(server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });
  const clients = new Map();

  function onlineList() {
    const seen = new Set();
    const list = [];
    for (const { login } of clients.values()) {
      if (!seen.has(login)) {
        seen.add(login);
        list.push(login);
      }
    }
    return list;
  }

  function broadcast(obj) {
    const data = JSON.stringify(obj);
    for (const ws of clients.keys()) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    let auth;
    try {
      auth = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      ws.close(4001, "unauthorized");
      return;
    }

    clients.set(ws, { userId: auth.uid, login: auth.login });

    // Отдаём последние 50 сообщений истории + текущий онлайн
    const history = db
      .prepare("SELECT login, text, created_at FROM chat_messages ORDER BY id DESC LIMIT 50")
      .all()
      .reverse();
    ws.send(JSON.stringify({ type: "history", messages: history }));
    broadcast({ type: "online", users: onlineList() });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type !== "message" || !msg.text || !msg.text.trim()) return;

      const text = String(msg.text).slice(0, 500).trim();
      const client = clients.get(ws);
      const createdAt = Date.now();

      db.prepare(
        "INSERT INTO chat_messages (user_id, login, text, created_at) VALUES (?, ?, ?, ?)"
      ).run(client.userId, client.login, text, createdAt);

      broadcast({ type: "message", login: client.login, text, created_at: createdAt });
    });

    ws.on("close", () => {
      clients.delete(ws);
      broadcast({ type: "online", users: onlineList() });
    });
  });

  return wss;
}

module.exports = { attachChat };
