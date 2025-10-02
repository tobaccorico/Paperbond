const User = require("../models/User");
const ReqError = require("../utilities/ReqError");
const jwt = require("jsonwebtoken");
const catchAsyncError = require("../utilities/catchAsyncError");

const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");
const { verifyAptosSignature } = require("../utilities/aptosVerify");

const nonces = new Map();

exports.getNonce = async (req, res) => {
  const nonce = randomUUID();
  nonces.set(nonce, Date.now());
  // expire old nonces
  for (const [n, ts] of nonces) {
    if (Date.now() - ts > 5 * 60 * 1000) nonces.delete(n);
  }
  res.json({ nonce });
};

exports.verify = async (req, res) => {
  try {
    const { address, publicKey, signature, fullMessage, nonce, application, chainId } = req.body;

    if (!nonces.has(nonce)) return res.status(400).send("Invalid/expired nonce");
    nonces.delete(nonce);

    // Verify signature against the standardized fullMessage
    const ok = await verifyAptosSignature({ publicKey, signature, message: fullMessage });
    if (!ok) return res.status(401).send("Bad signature");

    // Upsert user by wallet address
    let user = await User.findOne({ aptosAddress: address.toLowerCase() });
    if (!user) {
      user = await User.create({
        username: `aptos_${address.slice(0, 6)}`, // or prompt user later
        aptosAddress: address.toLowerCase(),
        aptosPublicKey: publicKey,
        online: false,
      });
    } else {
      if (user.aptosPublicKey !== publicKey) {
        user.aptosPublicKey = publicKey;
        await user.save();
      }
    }

    // Mint short-lived JWT for API + socket handshake
    const token = jwt.sign(
      { sub: user._id.toString(), addr: address.toLowerCase(), pk: publicKey },
      process.env.JWT_SECRET || "dev_secret_change_me",
      { expiresIn: "2h" }
    );

    // httpOnly cookie (frontend uses credentials: "include")
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2 * 60 * 60 * 1000,
    });

    res.json({ ok: true, userId: user._id });
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
};

const signToken = (user) => {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

const assignTokenToCookie = (user, res, statusCode) => {
  const token = signToken(user);

  const cookieOptions = {
    httpOnly: true,
    secure: true,
    expires: new Date(
      Date.now() + parseInt(process.env.JWT_EXPIRES_IN) * 24 * 60 * 60 * 1000
    ),
  };

  res.cookie("telegramToken", token, cookieOptions);
  res.cookie("userId", user._id);

  user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    data: {
      token,
      user,
    },
  });
};

exports.login = catchAsyncError(async (req, res, next) => {
  // Takes in username and password
  const { username, password } = req.body;

  // If there's no details given
  if (!username) return next(new ReqError(400, "Username and Password needed"));

  const foundUser = await User.findOne({ username });

  //   If username does not exist
  if (!foundUser)
    return next(new ReqError(400, "Username or Password incorrect"));

  const passwordGivenCorrect = await foundUser.checkPasswordValidity(
    password,
    foundUser.password
  );

  //   If given password is incorrect
  if (!passwordGivenCorrect)
    return next(new ReqError(400, "Username or Password incorrect"));

  assignTokenToCookie(foundUser, res, 200);
});

exports.register = catchAsyncError(async (req, res, next) => {
  const newUser = await User.create(req.body);

  assignTokenToCookie(newUser, res, 201);
});
