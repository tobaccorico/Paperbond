// index.js
require("dotenv").config(); // ensure env is available to server/socket

// server.js should export the http server (or at least a reference to it)
const { expressServer } = require("./server");

// socket.js should export a function that takes the http server and attaches socket.io
require("./socket")(expressServer);

// (nothing else needed here)
