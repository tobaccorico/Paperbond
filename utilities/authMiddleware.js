
const jwt = require("jsonwebtoken");

exports.requireAuth = (req, res, next) => {
  try {
    const bearer = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const token = req.cookies?.auth_token || bearer;
    if (!token) return res.status(401).send("Unauthenticated");
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret_change_me");
    req.user = payload; // { sub: mongoId, addr: aptosAddress, pk: aptosPublicKey, iat, exp }
    next();
  } catch (e) {
    return res.status(401).send("Invalid token");
  }
};
