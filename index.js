const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const mongoString = process.env.DB_HOST;
const bodyParser = require("body-parser");
const manageRoutes = require("./src/routes/routes.manage");
const endpointRoutes = require("./src/routes/routes.endpoint");
const playbookRoutes = require("./src/routes/routes.playbook");

const { io } = require("socket.io-client");
const socket = io(`ws://localhost:${process.env.BE_SOCKET_PORT}`, {
  transports: ["websocket"],
});

mongoose.connect(`${mongoString}/Sera`, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const database = mongoose.connection;

database.on("error", (error) => {
  console.log(error);
  process.exit();
});
database.once("connected", () => {
  console.log("Database Connected");
  const app = express();
  const http = require("http");
  const server = http.createServer(app);

  app.use(cors(), express.json(), bodyParser.urlencoded({ extended: true }));

  app.use((req, res, next) => {
    req.socket = socket; // Attach socket to request
    next();
  });

  app.use("/manage", manageRoutes);
  app.use("/manage/endpoint", endpointRoutes);
  app.use("/manage/playbook", playbookRoutes);

  socket.on("connectSuccessful", () => {
    console.log("Connected to WebSocket server");
  });

  server.listen(process.env.BE_BUILDER_PORT, () => {
    console.log(`Builder Started at ${process.env.BE_BUILDER_PORT}`);
    socket.emit("backendConnect");
  });
});
