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
const groupTokenRouter = require("./routers/groupTokenRouter"); 

// App
const app = express();

// Body & cookies
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || true,
    credentials: true,
  })
);

// PUBLIC ROUTES
app.use("/api/auth", authRouter);
app.use("/api/user", authRouter);
app.use("/api/me", require("./routers/me"));

// PROTECTED ROUTES
app.use("/api/contacts", requireAuth, contactsRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/chatRoom", requireAuth, chatRoomRouter);
app.use("/api/upload", requireAuth, uploadRouter);
app.use("/api/group-token", requireAuth, groupTokenRouter); 

// 404 for unknown routes
app.use("/api/*", (req, res, next) => next(new ReqError(404, "API route not found")));

// Error handler
app.use(errorController);

module.exports = app;