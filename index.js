import 'dotenv/config';
import Fastify from "fastify";
import mongoose from "mongoose";
import WebSocket from "ws";
import gridfs from 'mongoose-gridfs';

import hostRoutes from "./src/routes/routes.host.js";
import builderRoutes from "./src/routes/routes.builder.js";
import integrationRoutes from "./src/routes/routes.integration.js";
import eventRoutes from "./src/routes/routes.events.js";
import searchRoutes from "./src/routes/routes.search.js";
import analyticsRoutes from "./src/routes/routes.analytics.js";

const { default: sera_events_model } = await import("./src/models/models.sera_events.cjs");


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
let attachment;

(async () => {
  try {
    await mongoose.connect(`${mongoString}/Sera`, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    attachment = gridfs.createBucket({
      connection: mongoose.connection,  // Use the established Mongoose connection
    });

    console.log("Database Connected");

    // Register Fastify plugins
    // await app.register(import('@fastify/cors'), { origin: "*" });
    await app.register((await import('@fastify/formbody')).default);
    await app.register((await import('@fastify/multipart')).default, {
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
    app.register(integrationRoutes, { attachment });

    // Start the server
    app.listen({ port, host: '0.0.0.0' }, (err) => {
      if (err) {
        console.log(err);
        process.exit(1);
      }
      sera_events_model.create({ event: "sera", type: "seraStart", srcIp: "127.0.0.1", data: { result: "success", timestamp: new Date().getTime() } })
      console.log(`Builder Started at ${port}`);
    });
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
