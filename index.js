require("dotenv").config();
const Fastify = require("fastify");
const mongoose = require("mongoose");
const WebSocket = require("ws");

const manageRoutes = require("./src/routes/routes.manage");
const endpointRoutes = require("./src/routes/routes.endpoint");
const playbookRoutes = require("./src/routes/routes.playbook");

const mongoString = process.env.DB_HOST;
const port = process.env.BE_BUILDER_PORT;

let socket;

function connectWebSocket() {
  socket = new WebSocket(`ws://localhost:${process.env.BE_SOCKET_PORT}/sera-socket-io`);

  global.socket = socket;

  // Wrapper for the emit function to keep the existing API
  global.socket.wsEmit = (event, data) => {
    const message = JSON.stringify({ type: event, ...data });
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    } else {
      console.log("WebSocket is not open, unable to send message:", message);
    }
  };

  // Handle incoming messages
  socket.onmessage = (event) => {
    const parsedMessage = JSON.parse(event.data);
    console.log("Message received from server:", parsedMessage);

    // You can add logic here to handle specific types of messages if needed
  };

  socket.onopen = () => {
    console.log("WebSocket connection established");
    // Only emit "backendConnect" after the connection is established
    global.socket.wsEmit("backendConnect");
  };

  socket.onclose = () => {
    console.log("WebSocket connection closed. Reconnecting...");
    setTimeout(connectWebSocket, 1000); // Attempt to reconnect after 1 second
  };

  socket.onerror = (error) => {
    console.log("WebSocket error:", error.message);
  };
}

// Initialize WebSocket connection
connectWebSocket();

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

    // Start the server
    app.listen({ port, host: '0.0.0.0' }, (err) => {
      if (err) {
        console.log(err);
        process.exit(1);
      }
      console.log(`Builder Started at ${port}`);
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
