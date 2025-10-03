const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

// Aptos sign-in only
router.post("/nonce", authController.getNonce);
router.post("/verify", authController.verify);

module.exports = router;
