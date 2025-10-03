// controllers/authController.js
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { verifyEd25519Flexible } = require("../utilities/aptosVerify");
const User = require("../models/User");

// Simple in-memory nonce store for dev:
// Map<lowercase address, { nonce: string, expires: number }>
const nonces = new Map();
const NONCE_TTL_MS = 5 * 60 * 1000;

exports.getNonce = async (req, res) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  // We don't know the address yet; client will send it on /verify along with the nonce.
  // We’ll just return it and validate on /verify.
  res.json({ nonce });
};

exports.verify = async (req, res) => {
  try {
    
    const { address, publicKey, signature, fullMessage, nonce } = req.body || {};

    console.log("verify body:", {
      address: (address || "").slice(0, 12) + "...",
      publicKeyType: typeof publicKey,
      signatureType: typeof signature,
      publicKeyLen: typeof publicKey === "string" ? publicKey.length : (publicKey?.length ?? -1),
      signatureLen: typeof signature === "string" ? signature.length : (signature?.length ?? -1),
      fullMessageFirstLine: (fullMessage || "").split("\n")[0],
      nonce,
    });

    if (!address || !publicKey || !signature || !fullMessage || !nonce) {
      return res.status(400).send("Missing fields");
    }

    const ok = await verifyEd25519Flexible({
      publicKey,               // can be hex/base64/bytes/array
      signature,               // can be hex/base64/bytes/array
      message: fullMessage,    // exact string from wallet
    });

    if (!ok) return res.status(401).send("Bad signature");

    // 2) Basic nonce check (bind to address in memory)
    // If you want strict binding, remember last nonce seen per address.
    // We’ll allow any one-time nonce for dev: store and check on next call.
    const key = String(address).toLowerCase();
    const cached = nonces.get(key);
    const now = Date.now();

    if (!cached || cached.nonce !== nonce || cached.expires < now) {
      // First time we see this address+nonce, accept and then store it to prevent replay,
      // OR you can require clients to POST address to /nonce and pre-bind it here.
      nonces.set(key, { nonce, expires: now + NONCE_TTL_MS });
    } else {
      // Replay attempt within TTL → reject
      return res.status(401).send("Nonce already used");
    }

    // 3) Upsert the user with aptos keys on record
    let user = await User.findOne({ aptosAddress: key });
    if (!user) {
      user = await User.create({
        username: key,              // or derive something nicer
        aptosAddress: key,
        aptosPublicKey: publicKey,
      });
    } else if (!user.aptosPublicKey) {
      user.aptosPublicKey = publicKey;
      await user.save();
    }

    // 4) Issue JWT (httpOnly cookie)
    const token = jwt.sign(
      {
        sub: user._id.toString(),
        addr: key,
        pk: publicKey,
      },
      process.env.JWT_SECRET || "dev_secret_change_me",
      { expiresIn: "2h" }
    );

    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production", // dev over http works
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.json({ ok: true, userId: user._id });
  } catch (e) {
    console.error("verify error:", e);
    res.status(500).send("Server error");
  }
};
