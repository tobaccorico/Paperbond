const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const ReqError = require("./utilities/ReqError");
const errorController = require("./controllers/errorController");
const { requireAuth } = require("./utilities/authMiddleware");

const contactsRouter = require("./routers/contactsRouter");
const chatRoomRouter = require("./routers/chatRoomRouter");
const profileRouter = require("./routers/profileRouter");
const uploadRouter = require("./routers/uploadRouter");

const app = express();

// Body & cookies
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// CORS (allow cookies across origins when CLIENT_URL is set)
app.use(
  cors({
    origin: process.env.CLIENT_URL || true, // set to your client URL in prod
    credentials: true,
  })
);

// ----- PUBLIC ROUTES (no auth) -----
app.use("/api/auth", require("./routers/auth")); // nonce + verify (Aptos)
app.use("/api/me", require("./routers/me"));     // responds 200 only if auth cookie is valid (me router itself uses requireAuth)

// ----- PROTECTED ROUTES (JWT required) -----
app.use("/api/contacts", requireAuth, contactsRouter);
app.use("/api/profile", requireAuth, profileRouter);
app.use("/api/chatRoom", requireAuth, chatRoomRouter); // fixed comma/typo
app.use("/api/upload", requireAuth, uploadRouter);

// (Optional) catch-all 404 for /api
app.use("/api/*", (req, res, next) => {
  next(new ReqError(404, "API route not found"));
});

// Error handler
app.use(errorController);

module.exports = app;
