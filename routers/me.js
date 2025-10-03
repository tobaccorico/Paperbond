
const router = require("express").Router();
const { requireAuth } = require("../utilities/authMiddleware");
const User = require("../models/User");

router.get("/", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub).select(
    "username aptosAddress aptosPublicKey avatar bio"
  );
  res.json({ user });
});

module.exports = router;
