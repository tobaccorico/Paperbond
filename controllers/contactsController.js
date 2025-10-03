const catchAsyncError = require("../utilities/catchAsyncError");
const User = require("../models/User");
const ReqError = require("../utilities/ReqError");
const {
  createChatRoom,
  checkIfChatRoomExists,
  deleteChatRoom,
} = require("./chatRoomController");

exports.getAllContacts = catchAsyncError(async (req, res, next) => {
  const user = await User.findById(req.user.sub).populate({
    path: "contacts.contactDetails",
    select: "id username bio avatar status",
  });

  if (!user) return next(new ReqError(400, "Username does not exist"));

  res.status(200).json({
    status: "success",
    data: {
      contacts: user.contacts,
    },
  });
});

exports.addNewContact = catchAsyncError(async (req, res, next) => {
  const { name, username } = req.body;

  if (!username) return next(new ReqError(400, "Contact username is needed"));

  const user = await User.findById(req.user.sub);
  const newContact = await User.findOne({ username: username });

  if (!newContact) return next(new ReqError(400, "User does not exist"));
  if (user.username === newContact.username)
    return next(new ReqError(400, "You can't add yourself as a contact"));

  for (let contact of user.contacts) {
    if (contact.contactDetails.toString() === newContact._id.toString()) {
      return next(new ReqError(400, "Contact exists already"));
    }

    if (contact.name === name) {
      return next(new ReqError(400, "Contact name exists already"));
    }
  }

  let chatRoomId = await checkIfChatRoomExists(user, newContact);

  if (!chatRoomId) {
    const chatRoomDetails = {
      roomType: "Private",
      members: [newContact._id, user._id],
      messageHistory: [],
    };

    const newChatRoom = await createChatRoom(chatRoomDetails);

    if (!newChatRoom)
      return next(new ReqError(404, "Contact could not be added"));

    chatRoomId = newChatRoom._id;

    user.chatRooms.push(chatRoomId);
    newContact.chatRooms.push(chatRoomId);
  }

  const newContactData = {
    name,
    contactDetails: newContact._id,
    chatRoomId,
  };

  user.contacts.push(newContactData);

  await user.save({ validateBeforeSave: false });
  await newContact.save({ validateBeforeSave: false });

  res.status(201).json({
    status: "success",
    data: {
      contact: {
        name,
        contactDetails: {
          username: newContact.username,
          _id: newContact._id,
          avatar: newContact.avatar,
          bio: newContact.bio,
          status: newContact.status,
        },
        chatRoomId,
      },
    },
  });
});

exports.deleteContact = catchAsyncError(async (req, res, next) => {
  const { username } = req.body;

  if (!username) return next(new ReqError(400, "Contact username is missing"));

  const user = await User.findById(req.user.sub);
  const aimedContact = await User.findOne({ username: username });

  if (!aimedContact) return next(new ReqError(400, "User does not exist"));

  let chatRoomId;

  const id = aimedContact._id.toString();

  user.contacts = user.contacts.filter((contact) => {
    if (contact.contactDetails.toString() === id) {
      chatRoomId = contact.chatRoomId;
      return;
    }

    return true;
  });

  const chatRoomExists = await checkIfChatRoomExists(user, aimedContact);

  if (!chatRoomExists) {
    await deleteChatRoom(chatRoomId);
    user.chatRooms = user.chatRooms.filter(
      (roomId) => roomId.toString() !== chatRoomId.toString()
    );
    aimedContact.chatRooms = aimedContact.chatRooms.filter(
      (roomId) => roomId.toString() !== chatRoomId.toString()
    );

    user.pinnedChatRooms = user.pinnedChatRooms.filter(
      (roomId) => roomId.toString() !== chatRoomId.toString()
    );
    aimedContact.pinnedChatRooms = aimedContact.pinnedChatRooms.filter(
      (roomId) => roomId.toString() !== chatRoomId.toString()
    );

    await aimedContact.save({ validateBeforeSave: false });
  }

  await user.save({ validateBeforeSave: false });

  res.status(204).json({
    status: "success",
    message: "Contact successfully deleted",
  });
});