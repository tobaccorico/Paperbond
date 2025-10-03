const ChatRoom = require("../models/ChatRoom");
const User = require("../models/User");
const catchAsyncError = require("../utilities/catchAsyncError");
const ReqError = require("../utilities/ReqError");

exports.createChatRoom = async (chatRoomDetails) =>
  await ChatRoom.create(chatRoomDetails);

exports.getChatRoom = catchAsyncError(async (req, res, next) => {
  const chatRoom = await ChatRoom.findById(req.params.chatRoomId);
  if (!chatRoom) return next(new ReqError(400, "Chat does not exist"));

  res.status(200).json({
    status: "success",
    data: { chatRoom },
  });
});

exports.getChatRoomSummaryForUser = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user.sub);

  let chatRoomSummary = await Promise.all(
    user.chatRooms.map(async (chatRoomId) => {
      const outputSummary = {};

      const chatRoom = await ChatRoom.findById(chatRoomId).populate({
        path: "members",
        select: "id username avatar bio status",
      });

      if (!chatRoom) return next(new ReqError("Chat room can't be found"));

      if (chatRoom.messageHistory.length) {
        const lastDay =
          chatRoom.messageHistory[chatRoom.messageHistory.length - 1];

        outputSummary.latestMessage =
          lastDay.messages[lastDay.messages.length - 1];

        outputSummary.unreadMessagesCount = user.unreadMessages.reduce(
          (acc, curr) => {
            if (chatRoomId.toString() === curr.chatRoomId.toString())
              return (acc += 1);

            return acc;
          },
          0
        );
      } else {
        outputSummary.latestMessage = {};
        outputSummary.unreadMessagesCount = 0;
      }

      outputSummary.chatRoomId = chatRoomId;
      outputSummary.roomType = chatRoom.roomType;

      if (chatRoom.roomType === "Private") {
        const profile = chatRoom.members.find(
          (member) => user._id.toString() !== member._id.toString()
        );

        outputSummary.profile = profile;
        outputSummary.profile.name = user.contacts.find(
          (contact) =>
            contact.contactDetails.toString() === profile._id.toString()
        )?.name;
      }

      outputSummary.mode = null;

      outputSummary.pinned = user.pinnedChatRooms.some(
        (chatRoom) => chatRoom.toString() === chatRoomId.toString()
      );

      return outputSummary;
    })
  );

  const pinnedChats = chatRoomSummary
    .filter((chatRoom) => chatRoom.pinned)
    .sort((a, b) => {
      const latestMessageInATime = new Date(a.latestMessage.timeSent).getTime();
      const latestMessageInBTime = new Date(b.latestMessage.timeSent).getTime();

      return latestMessageInBTime - latestMessageInATime;
    });

  const unpinnedChats = chatRoomSummary
    .filter((chatRoom) => !chatRoom.pinned)
    .sort((a, b) => {
      const latestMessageInATime = new Date(a.latestMessage.timeSent).getTime();
      const latestMessageInBTime = new Date(b.latestMessage.timeSent).getTime();

      return latestMessageInBTime - latestMessageInATime;
    });

  chatRoomSummary = [...pinnedChats, ...unpinnedChats];

  res.status(200).json({
    status: "success",
    data: {
      chatRoomSummary,
    },
  });
});

exports.pinChatRoom = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user.sub);
  user.pinnedChatRooms.push(req.params.chatRoomId);
  await user.save();

  res.status(200).json({
    status: "success",
    data: {
      pinnedChatRooms: user.pinnedChatRooms,
    },
  });
});

exports.unpinChatRoom = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user.sub);
  user.pinnedChatRooms = user.pinnedChatRooms.filter(
    (chatRoomId) => chatRoomId.toString() !== req.params.chatRoomId
  );
  await user.save();

  res.status(200).json({
    status: "success",
    data: {
      pinnedChatRooms: user.pinnedChatRooms,
    },
  });
});

exports.checkIfChatRoomExists = async (user, secondaryUser) => {
  let chatRoomId;
  secondaryUser.contacts.forEach((contact) => {
    if (contact.contactDetails.toString() === user._id.toString()) {
      chatRoomId = contact.chatRoomId;
    }
  });

  return chatRoomId;
};

exports.deleteChatRoom = async (chatRoomId) => {
  await ChatRoom.findByIdAndDelete(chatRoomId);
};

exports.clearChatRoom = async ({ chatRoomId }) => {
  const chatRoom = await ChatRoom.findById(chatRoomId);

  chatRoom.messageHistory = [];

  for (memberId of chatRoom.members) {
    const memberModel = await User.findById(memberId);

    memberModel.unreadMessages = memberModel.unreadMessages.filter(
      (data) => data.chatRoomId.toString() !== chatRoom._id.toString()
    );

    memberModel.undeliveredMessages = memberModel.undeliveredMessages.filter(
      (data) => data.chatRoomId.toString() !== chatRoom._id.toString()
    );

    await memberModel.save();
  }

  await chatRoom.save();
};

exports.getAllChatRoomUserIn = async (userId) => {
  const user = await User.findById(userId);
  return user.chatRooms;
};

exports.addMessageToChatRoom = async (chatRoomId, message) => {
  const chatRoom = await ChatRoom.findById(chatRoomId);

  const lastDayMessage =
    chatRoom.messageHistory[chatRoom.messageHistory.length - 1];

  const dayString = new Date(message.timeSent).toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  const day = new Date(dayString).getTime();

  message.undeliveredMembers = chatRoom.members;
  message.unreadMembers = chatRoom.members.filter(
    (memberId) => memberId.toString() !== message.sender.toString()
  );

  if (lastDayMessage?.day === day) {
    lastDayMessage.messages.push(message);
  } else {
    const newDayObject = {
      day,
      messages: [message],
    };
    chatRoom.messageHistory.push(newDayObject);
  }

  await chatRoom.save();

  const messageObj =
    chatRoom.messageHistory[chatRoom.messageHistory.length - 1].messages[
      chatRoom.messageHistory[chatRoom.messageHistory.length - 1].messages
        .length - 1
    ];

  return { messageObj, chatRoom, day };
};

exports.getMessageFromChatRoom = async ({ chatRoomId, messageId, day }) => {
  const chatRoom = await ChatRoom.findById(chatRoomId);

  if (!chatRoom.messageHistory.length) return {};

  const dayMessage = chatRoom.messageHistory.find(
    (dayMessage) => dayMessage.day === day
  );

  const message = dayMessage.messages.find(
    (message) => message._id.toString() === messageId.toString()
  );

  return { chatRoom, message };
};

exports.checkMembersOffUndeliveredListInMessage = async ({
  membersId,
  messageId,
  chatRoomId,
  day,
  io,
}) => {
  const { message, chatRoom } = await this.getMessageFromChatRoom({
    day,
    messageId,
    chatRoomId,
  });

  if (!message) return;

  message.undeliveredMembers = message.undeliveredMembers.filter(
    (memberId) => !membersId.includes(memberId.toString())
  );

  if (!message.undeliveredMembers.length) {
    message.deliveredStatus = true;

    io.to(chatRoomId).emit("user:messageDelivered", {
      messageId: message._id,
      senderId: message.sender,
      chatRoomId,
      day,
    });
  }

  await chatRoom.save();

  return {
    undeliveredMembers: message.undeliveredMembers,
    messageDelivered: message.deliveredStatus,
  };
};

exports.addMessageAsUndeliveredToUser = async ({
  undeliveredMembers,
  chatRoomId,
  messageId,
  day,
}) => {
  for (let memberId of undeliveredMembers) {
    const memberModel = await User.findById(memberId.toString());

    memberModel.undeliveredMessages.push({
      day,
      chatRoomId,
      messageId,
    });

    await memberModel.save();
  }
};

exports.addMessageAsUnreadToUser = async ({
  unreadMembers,
  chatRoomId,
  messageId,
  day,
}) => {
  for (let memberId of unreadMembers) {
    const memberModel = await User.findById(memberId);

    memberModel.unreadMessages.push({
      day,
      chatRoomId,
      messageId,
    });

    await memberModel.save();
  }
};

exports.markMessageAsReadByUser = async ({
  messageId,
  chatRoomId,
  day,
  userId,
  io,
}) => {
  const { message, chatRoom } = await this.getMessageFromChatRoom({
    messageId,
    chatRoomId,
    day,
  });

  if (!message) return;

  const user = await User.findById(userId);

  user.unreadMessages = user.unreadMessages.filter(
    (message) => message.messageId.toString() !== messageId.toString()
  );

  message.unreadMembers = message.unreadMembers.filter(
    (memberId) => memberId.toString() !== userId.toString()
  );

  if (!message.unreadMembers.length) {
    message.readStatus = true;

    io.to(chatRoomId).emit("user:messageReadByAllMembers", {
      messageId: message._id,
      senderId: message.sender,
      chatRoomId,
      day,
    });
  }

  await chatRoom.save();
  await user.save();
};