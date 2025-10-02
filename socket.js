// socket.js (server)
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// If you want to read cookies in the handshake easily:
function getCookie(name, cookieHeader = "") {
  const cookies = cookieHeader.split("; ").map((c) => c.split("="));
  const m = cookies.find(([k]) => k === name);
  return m ? decodeURIComponent(m[1]) : undefined;
}

module.exports = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || true, // set your client URL in prod
      credentials: true,                      // allow cookies
    },
  });

  // Auth gate: verify JWT from Authorization Bearer OR from cookie
  io.use((socket, next) => {
    try {
      const hdr = socket.handshake.headers?.authorization || "";
      const bearer = hdr.replace(/^Bearer\s+/i, "") || undefined;
      const cookieToken = getCookie("auth_token", socket.handshake.headers?.cookie || "");
      const token = bearer || cookieToken;
      if (!token) return next(new Error("Unauthenticated"));

      const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret_change_me");
      socket.user = payload; // { sub, addr, pk, iat, exp }
      next();
    } catch (e) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    // Example: join a per-user room
    socket.join(`user:${socket.user.sub}`);

    // your existing event handlers...
    socket.on("message:send", (payload, ack) => {
      // ...
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      // cleanup/logs as needed
    });
  });

  return io;
};
