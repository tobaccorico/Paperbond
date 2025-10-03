const catchAsyncError = require("../utilities/catchAsyncError");
const ReqError = require("../utilities/ReqError");
const User = require("../models/User");

exports.getSelfProfile = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user.sub).select(
    "-contacts -password -__v"
  );

  if (!user) return next(new ReqError(400, "User does not exist"));

  res.status(200).json({
    status: "Success",
    data: {
      user,
    },
  });
});

exports.updateSelfProfile = catchAsyncError(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(req.user.sub, req.body, {
    new: true,
  });

  if (!user) return next(new ReqError(400, "User does not exist"));

  res.status(200).json({
    status: "Success",
    data: {
      user,
    },
  });
});