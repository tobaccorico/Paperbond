const router = require("express").Router();
const User = require("../models/User");
const { requireAuth } = require("../utilities/authMiddleware");

router.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub).select("username aptosAddress aptosPublicKey avatar bio");
  res.json({ user });
});

module.exports = router;
