// app.js
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const ReqError = require("./utilities/ReqError");
const errorController = require("./controllers/errorController");
const { requireAuth } = require("./utilities/authMiddleware");

// Routers
const authRouter       = require("./routers/authRouter"); 
const contactsRouter   = require("./routers/contactsRouter");
const chatRoomRouter   = require("./routers/chatRoomRouter");
const profileRouter    = require("./routers/profileRouter");
const uploadRouter     = require("./routers/uploadRouter");

// App
const app = express();

// Body & cookies
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// CORS (allow cookies if client runs on another origin)
app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  })
);

// ---------- PUBLIC ROUTES ----------
app.use("/api/auth", authRouter);     // now serves /api/auth/nonce and /api/auth/verify
// Optional alias to keep old clients hitting /api/user/*
app.use("/api/user", authRouter);

// Small whoami route for AuthGate (ensure routers/me.js exists and uses requireAuth inside)
app.use("/api/me", require("./routers/me"));

// ---------- PROTECTED ROUTES ----------
app.use("/api/contacts", requireAuth, contactsRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/chatRoom", requireAuth, chatRoomRouter);  // <-- fixed the typo (was a dot)
app.use("/api/upload", requireAuth, uploadRouter);

// Optional 404 for unknown /api routes
app.use("/api/*", (req, res, next) => next(new ReqError(404, "API route not found")));

// Error handler
app.use(errorController);

module.exports = app;
