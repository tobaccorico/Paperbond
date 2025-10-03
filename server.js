const express = require("express");
const path = require("path");
const dotenv = require("dotenv");

const mongoose = require("mongoose");
mongoose.set("strictQuery", true);

// Load env FIRST
dotenv.config({ path: "./.env" });

const app = require("./app");

// Connect database
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Database connected..."))
  .catch((error) => console.log("An error occured...", error));

// Serve client build (adjust if you use Vite dev server in dev)
app.use(express.static(path.join(__dirname, "client", "build")));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "build", "index.html"));
});

// Listen
exports.expressServer = app.listen(process.env.PORT || 4000, () =>
  console.log(`Listening on ${process.env.PORT || 4000}...`)
);
