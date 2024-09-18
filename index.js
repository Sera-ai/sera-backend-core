require("dotenv").config();
const Fastify = require("fastify");
const mongoose = require("mongoose");
const WebSocket = require("ws");
const gridfsStream = require('gridfs-stream');

const hostRoutes = require("./src/routes/routes.host");
const builderRoutes = require("./src/routes/routes.builder");
const integrationRoutes = require("./src/routes/routes.integration");
const eventRoutes = require("./src/routes/routes.events");
const searchRoutes = require("./src/routes/routes.search");
const analyticsRoutes = require("./src/routes/routes.analytics");
const seraEvents = require("./src/models/models.seraEvents")

const mongoString = process.env.DB_HOST;
const port = process.env.BE_BUILDER_PORT;
let socket;

function connectWebSocket() {
  socket = new WebSocket(`ws://localhost:12040/sera-socket-io`);

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
    setTimeout(connectWebSocket, 1000); // Attempt to reconnect after 1 second
  };

  socket.onerror = (error) => {
    // muting for now console.log("WebSocket error:", error.message);
  };
}

// Initialize WebSocket connection
connectWebSocket();

const app = Fastify();
let gfs;

(async () => {
  try {


    await mongoose.connect(`${mongoString}/Sera`, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const db = mongoose.connection.db;
    gfs = gridfsStream(db, mongoose.mongo); // Initialize GridFS stream with Mongoose
    gfs.collection('uploads'); // Set the GridFS collection

    var writestream = gfs.createWriteStream({
      filename: 'my_file.txt'
    });

    console.log("Database Connected");

    // Register Fastify plugins
    // await app.register(require('@fastify/cors'), { origin: "*" });
    await app.register(require('@fastify/formbody'));
    await app.register(require('@fastify/multipart'), {
      limits: {
        fileSize: 10000000, // Set to 10 MB or adjust as needed
      },
      logger: true,
      bodyLimit: 10485760,
    });

    // Register the multipart plugin
    app.setErrorHandler((error, request, reply) => {
      reply
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Forwarded-For, X-Sera-Service, X-Sera-Builder")
        .status(500)
        .send({ error: 'Internal Server Error' });
    });
    // Register routes with unique prefixes
    app.register(searchRoutes);
    app.register(hostRoutes.routes);
    app.register(builderRoutes);
    app.register(eventRoutes);
    app.register(analyticsRoutes);
    app.register(integrationRoutes, { gfs });

    // Start the server
    app.listen({ port, host: '0.0.0.0' }, (err) => {
      if (err) {
        console.log(err);
        process.exit(1);
      }
      seraEvents.create({ event: "sera", type: "seraStart", srcIp: "127.0.0.1", data: { result: "success", timestamp: new Date().getTime() } })
      console.log(`Builder Started at ${port}`);
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
