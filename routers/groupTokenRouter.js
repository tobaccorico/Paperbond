const express = require("express");
const groupTokenController = require("../controllers/groupTokenController");

const router = express.Router();

router.post("/initialize", groupTokenController.initializeGroupToken);
router.post("/confirm-initialize", groupTokenController.confirmGroupTokenInitialization);
router.post("/buy", groupTokenController.buildBuyTransaction);
router.post("/sell", groupTokenController.buildSellTransaction);
router.post("/register-usdc", groupTokenController.registerForUSDC);
router.post("/mint-usdc", groupTokenController.mintMockUSDC);
router.get("/:groupChatId", groupTokenController.getGroupTokenInfo);

module.exports = router;