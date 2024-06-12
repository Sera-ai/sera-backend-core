require("dotenv").config();
const Fastify = require("fastify");
const mongoose = require("mongoose");
const { io } = require("socket.io-client");
const manageRoutes = require("./src/routes/routes.manage");
const endpointRoutes = require("./src/routes/routes.endpoint");
const playbookRoutes = require("./src/routes/routes.playbook");

const mongoString = process.env.DB_HOST;
const socket = io(`ws://localhost:${process.env.BE_SOCKET_PORT}`, {
  path: '/sera-socket-io',
  transports: ["websocket"],
});

global.socket = socket

const app = Fastify();

(async () => {
  try {
    await mongoose.connect(`${mongoString}/Sera`, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Database Connected");

    // Register Fastify plugins
    await app.register(require('@fastify/cors'), { origin: "*" });
    await app.register(require('@fastify/formbody'));
    
    // Register routes with unique prefixes
    app.register(manageRoutes);
    app.register(endpointRoutes);
    app.register(playbookRoutes);

    // Handle WebSocket connection
    socket.on("connectSuccessful", () => {
      console.log("Connected to WebSocket server");
    });

    // Start the server
    const port = process.env.BE_BUILDER_PORT;
    app.listen({ port, host: '0.0.0.0' }, (err) => {
      if (err) {
        console.log(err);
        process.exit(1);
      }
      console.log(`Builder Started at ${port}`);
      socket.emit("backendConnect");
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
