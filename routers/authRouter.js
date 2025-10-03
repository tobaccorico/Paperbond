// routers/authRouter.js
const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Aptos authentication endpoints
router.post("/nonce", authController.getNonce);
router.post("/verify", authController.verify);
router.post("/logout", authController.logout);

module.exports = router;