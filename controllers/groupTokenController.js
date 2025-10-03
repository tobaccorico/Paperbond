const catchAsyncError = require("../utilities/catchAsyncError");
const ReqError = require("../utilities/ReqError");
const ChatRoom = require("../models/ChatRoom");
const AptosService = require("../utilities/AptosService");

exports.initializeGroupToken = catchAsyncError(async (req, res, next) => {
  const { groupChatId } = req.body;

  if (!groupChatId) {
    return next(new ReqError(400, "Group chat ID required"));
  }

  const chatRoom = await ChatRoom.findById(groupChatId);
  if (!chatRoom) {
    return next(new ReqError(404, "Chat room not found"));
  }

  if (chatRoom.algoToken?.isActive) {
    return next(new ReqError(400, "Group token already initialized"));
  }

  // Direct initialization - no factory
  res.status(200).json({
    status: "success",
    data: {
      transaction: {
        data: {
          function: `${AptosService.deployment.deployerAddress}::core::initialize`,
          typeArguments: [AptosService.deployment.stablecoinType],
          functionArguments: [
            "1200000000000000000",
            "63072000",
            "10000000000",
            "2592000"
          ],
        },
      },
    },
  });
});

exports.confirmGroupTokenInitialization = catchAsyncError(async (req, res, next) => {
  const { groupChatId, txHash } = req.body;

  const chatRoom = await ChatRoom.findById(groupChatId);
  if (!chatRoom) {
    return next(new ReqError(404, "Chat room not found"));
  }

  // The deployer address IS the module address for direct initialization
  const moduleAddress = AptosService.deployment.deployerAddress;

  chatRoom.algoToken = {
    moduleAddress, // Changed from instanceAddress
    createdBy: req.user.sub,
    createdAt: new Date(),
    isActive: true,
  };

  await chatRoom.save();

  res.status(200).json({
    status: "success",
    data: { chatRoom, txHash, moduleAddress },
  });
});

exports.getGroupTokenInfo = catchAsyncError(async (req, res, next) => {
  const { groupChatId } = req.params;

  const chatRoom = await ChatRoom.findById(groupChatId);
  if (!chatRoom) {
    return next(new ReqError(404, "Chat room not found"));
  }

  if (!chatRoom.algoToken?.isActive) {
    return res.status(200).json({
      status: "success",
      data: { hasToken: false },
    });
  }

  const moduleAddress = chatRoom.algoToken.moduleAddress;

  const [price, reserves, userTokenBalance, userUSDCBalance] = await Promise.all([
    AptosService.getTokenPrice(moduleAddress),
    AptosService.getReserves(moduleAddress),
    AptosService.getUserTokenBalance(req.user.addr, moduleAddress),
    AptosService.getUserUSDCBalance(req.user.addr),
  ]);

  res.status(200).json({
    status: "success",
    data: {
      hasToken: true,
      moduleAddress,
      price,
      reserves,
      userTokenBalance,
      userUSDCBalance,
      createdBy: chatRoom.algoToken.createdBy,
      createdAt: chatRoom.algoToken.createdAt,
    },
  });
});

exports.buildBuyTransaction = catchAsyncError(async (req, res, next) => {
  const { groupChatId, usdcAmount } = req.body;

  const chatRoom = await ChatRoom.findById(groupChatId);
  if (!chatRoom?.algoToken?.isActive) {
    return next(new ReqError(404, "Group token not found"));
  }

  const moduleAddress = chatRoom.algoToken.moduleAddress;

  res.status(200).json({
    status: "success",
    data: {
      transaction: {
        data: {
          function: `${moduleAddress}::core::buy`,
          typeArguments: [AptosService.deployment.stablecoinType],
          functionArguments: [usdcAmount, 0],
        },
      },
    },
  });
});

exports.buildSellTransaction = catchAsyncError(async (req, res, next) => {
  const { groupChatId, tokenAmount } = req.body;

  const chatRoom = await ChatRoom.findById(groupChatId);
  if (!chatRoom?.algoToken?.isActive) {
    return next(new ReqError(404, "Group token not found"));
  }

  const moduleAddress = chatRoom.algoToken.moduleAddress;

  res.status(200).json({
    status: "success",
    data: {
      transaction: {
        data: {
          function: `${moduleAddress}::core::sell`,
          typeArguments: [AptosService.deployment.stablecoinType],
          functionArguments: [tokenAmount, 0],
        },
      },
    },
  });
});

exports.registerForUSDC = catchAsyncError(async (req, res, next) => {
  res.status(200).json({
    status: "success",
    data: {
      transaction: {
        data: {
          function: `${AptosService.deployment.deployerAddress}::mock_usdc::register`,
          functionArguments: [],
        },
      },
    },
  });
});

exports.mintMockUSDC = catchAsyncError(async (req, res, next) => {
  const { amount = 1000_00000000 } = req.body;
  const userAddress = req.user.addr;

  const txHash = await AptosService.mintMockUSDC(userAddress, amount);

  res.status(200).json({
    status: "success",
    data: {
      txHash,
      amount,
      message: `Minted ${amount / 100000000} Mock USDC`,
    },
  });
});