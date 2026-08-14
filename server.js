require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./auth");
const paymentsRouter = require("./payments");
const { attachChat } = require("./chat");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
  })
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/payments", paymentsRouter);

const server = http.createServer(app);
attachChat(server); // ws://.../ws/chat?token=<jwt>

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`inlateXDLC backend запущен на порту ${PORT}`);
});
