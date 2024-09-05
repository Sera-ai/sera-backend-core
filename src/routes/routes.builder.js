const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");
const axios = require("axios");
const SwaggerParser = require("@apidevtools/swagger-parser");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const BuilderTemplate = require("../models/models.builder_template");
const IntegrationBuilder = require("../models/models.integrations");
const SeraSettings = require("../models/models.sera_settings");
const EventStruc = require("../models/models.eventStruc");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const Endpoints = require("../models/models.endpoints");

const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

const { getBuilder, getColor, getFields, generateRandomString } = require("../helpers/helpers.general")

/**
 * Registers routes for managing builders and associated entities in the Fastify server.
 *
 * This function sets up multiple endpoints for creating, retrieving, and managing builder configurations, including nodes, edges, and endpoints.
 * The available routes are:
 * - GET `/manage/builders`: Retrieves builder data with optional filtering by ID.
 * - POST `/manage/builder`: Creates a new builder endpoint.
 * - GET `/manage/builder`: Retrieves builder details by path and method.
 * - POST `/manage/builder/update`: Updates an existing builder.
 * - POST `/manage/builder/node`: Creates a new node for a builder.
 * - POST `/manage/builder/node/delete`: Deletes a node from a builder.
 * - POST `/manage/builder/edge`: Creates a new edge for a builder.
 * - PATCH `/manage/builder/edge`: Updates an existing edge in a builder.
 * - POST `/manage/builder/edge/delete`: Deletes an edge from a builder.
 * - POST `/manage/builder/create`: Creates a builder template with nodes and edges.
 * - GET `/manage/builder/getNode`: Retrieves a node by its ID.
 * - GET `/manage/builder/getNodeStruc`: Retrieves event structure data by event and type.
 *
 * @async
 * @function BuilderRoutes
 * @param {FastifyInstance} fastify - The Fastify instance to register the routes on.
 * @param {Object} options - The options object for route configuration.
 *
 * @route GET /manage/builders
 * @description Retrieves builder data, either all or filtered by ID.
 * @param {Object} request.query - The query parameters for filtering builder data.
 * @param {string} [request.query.id] - The ID of the builder to retrieve.
 * @returns {Array<Object>} An array of builder data, populated with host and builder IDs.
 * @throws {Error} If an error occurs while retrieving builder data.
 *
 * @route POST /manage/builder
 * @description Creates a new builder endpoint with the provided host and method data.
 * @param {Object} request.body - The request body containing host and endpoint data.
 * @param {string} request.body.host_id - The ID of the host associated with the builder.
 * @param {string} request.body.hostname - The hostname for the endpoint.
 * @param {string} request.body.endpoint - The endpoint path.
 * @param {string} request.body.method - The HTTP method for the endpoint.
 * @returns {Object} The saved builder endpoint data.
 * @throws {Error} If an error occurs while creating the builder.
 *
 * @route GET /manage/builder
 * @description Retrieves builder data based on the provided path and method.
 * @param {Object} request.query - The query parameters for retrieving the builder.
 * @param {string} [request.query.path] - The path to the endpoint.
 * @param {string} [request.query.event] - The event to filter builders.
 * @returns {Object} The builder details, including OAS, nodes, and edges.
 * @throws {Error} If the builder, host, or endpoint is not found.
 *
 * @route POST /manage/builder/update
 * @description Updates an existing builder's endpoint.
 * @param {Object} request.body - The request body containing the host and builder data.
 * @param {string} request.body.hostname - The hostname to update.
 * @param {string} request.body.endpoint - The endpoint to update.
 * @param {string} request.body.method - The HTTP method for the update.
 * @param {string} request.body.builder_id - The ID of the builder to update.
 * @returns {Object} The updated builder endpoint data.
 * @throws {Error} If an error occurs while updating the builder.
 *
 * @route POST /manage/builder/node
 * @description Creates a new node for the builder and saves it to the database.
 * @param {Object} request.body - The request body containing the node data.
 * @param {string} [request.query.type] - The type of the builder (e.g., builder, event, integration).
 * @param {string} request.headers["x-sera-builder"] - The builder ID from the headers.
 * @returns {Object} The saved node data.
 * @throws {Error} If an error occurs while creating the node.
 *
 * @route POST /manage/builder/node/delete
 * @description Deletes a node from the builder by its ID.
 * @param {Object} request.body - The request body containing the node data.
 * @param {string} request.headers["x-sera-builder"] - The builder ID from the headers.
 * @returns {string} A success message if the node is deleted.
 * @throws {Error} If the node or builder is not found.
 *
 * @route POST /manage/builder/edge
 * @description Creates a new edge for the builder and handles node connections.
 * @param {Object} request.body - The request body containing edge data.
 * @param {string} request.query.type - The type of the builder (e.g., builder, event).
 * @param {string} request.headers["x-sera-builder"] - The builder ID from the headers.
 * @returns {Object} The saved edge data.
 * @throws {Error} If an error occurs while creating the edge.
 *
 * @route PATCH /manage/builder/edge
 * @description Updates an existing edge in the builder by its ID.
 * @param {Object} request.body - The request body containing the updated edge data.
 * @param {string} request.headers["x-sera-builder"] - The builder ID from the headers.
 * @returns {Object} The updated edge data.
 * @throws {Error} If an error occurs while updating the edge.
 *
 * @route POST /manage/builder/edge/delete
 * @description Deletes an edge from the builder by its ID.
 * @param {Object} request.body - The request body containing the edge data.
 * @param {string} request.headers["x-sera-builder"] - The builder ID from the headers.
 * @returns {string} A success message if the edge is deleted.
 * @throws {Error} If the edge or builder is not found.
 *
 * @route POST /manage/builder/create
 * @description Creates a new builder with nodes and edges based on a template.
 * @param {Object} request.body - The request body containing host and path data.
 * @returns {Object} The saved builder data.
 * @throws {Error} If an error occurs while creating the builder.
 *
 * @route GET /manage/builder/getNode
 * @description Retrieves a specific node by its ID.
 * @param {Object} request.query - The query parameters for retrieving the node.
 * @param {string} request.query.id - The ID of the node to retrieve.
 * @returns {Object} The node data.
 * @throws {Error} If the node is not found.
 *
 * @route GET /manage/builder/getNodeStruc
 * @description Retrieves event structure data based on the provided event and type.
 * @param {Object} request.query - The query parameters for retrieving the structure.
 * @param {string} request.query.event - The event to filter the structure.
 * @param {string} [request.query.type] - The type of event structure to retrieve.
 * @returns {Object|Array<Object>} The event structure data.
 * @throws {Error} If an error occurs while retrieving the event structure data.
 */

async function routes(fastify, options) {
  fastify.get("/manage/builders", async (request, reply) => {
    try {
      let node_data;
      if (request.query.id) {
        node_data = await Endpoints.find({ _id: request.query.id }).populate([
          "host_id",
          "builder_id",
        ]);
      } else {
        node_data = await Endpoints.find()
          .populate(["host_id", "builder_id"])
          .limit(100);
      }
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.post("/manage/builder", async (request, reply) => {
    try {
      const data1 = await Hosts.findById(request.body.host_id);
      const truepath = (request.body.hostname + request.body.endpoint).replace(
        data1.hostname,
        ""
      );

      let host_id = data1._id;

      const data = new Endpoints({
        host_id: host_id,
        builder_id: request.body.builder_id ?? null,
        endpoint: truepath,
        method: request.body.method
      });

      try {
        const dataToSave = await data.save();
        reply.status(200).send(dataToSave);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/builder", async (request, reply) => {
    let endpoint;
    let parameters = {};
    let response = {};
    let responseCodes = [];
    let mongoEndpoint = null;
    let oas = null;
    let host = null;

    try {
      console.log(request.query)
      if (request.query.path) {

        const queryPath = request.query.path.split("/")
        if (queryPath[0] == "") queryPath.shift()

        host = queryPath[0]
        queryPath.shift()


        const method = (queryPath[queryPath.length - 1]).toUpperCase();
        queryPath.pop()

        const path = queryPath.join("/")

        const url = "http://" + host + "/" + path;
        const parsed = new URL(url);
        const oasUrl = `${parsed.protocol}//${parsed.host}`;


        const substringToMatch = parsed.host.split(":")[0];

        const matchingOas = await OAS.find({
          "servers.url": { $regex: substringToMatch },
        });

        const matchingHosts = await Hosts.find({
          hostname: { $regex: substringToMatch },
        });

        const normalizedUrl = url.replace(/^https?:\/\//, "").split("?")[0];

        let bestMatch = null;
        let bestMatchLength = 0;
        let bestMatchLength2 = 0;

        matchingOas.forEach((searchedOas) => {
          searchedOas.servers.forEach((server) => {
            const serverUrlNormalized = server.url.replace(/^https?:\/\//, "");

            if (normalizedUrl.startsWith(serverUrlNormalized)) {
              const matchLength = serverUrlNormalized.length;
              if (matchLength > bestMatchLength2) {
                oas = searchedOas;
                bestMatchLength2 = matchLength;
              }
            }
          });
        });

        matchingHosts.forEach((host) => {
          if (normalizedUrl.startsWith(host.hostname)) {
            const matchLength = host.hostname.length;
            if (matchLength > bestMatchLength) {
              bestMatch = host;
              bestMatchLength = matchLength;
            }
          }
        });

        host = bestMatch;
        if (!host) throw { error: "NoHost" };

        const truepath = `/${path}`;

        mongoEndpoint = await Endpoints.findOne({
          host_id: host._id,
          endpoint: (truepath.charAt(0) == "/" ? "" : "/") + truepath,
          method: method,
        });
        if (!mongoEndpoint) throw { error: "NoEndpoint", host: host._id };

        const { ...parseableOas } = oas;

        try {
          const api = await SwaggerParser.parse(oas);


          endpoint = api.paths[truepath][method.toLocaleLowerCase()];

          parameters = getRequestParameters(endpoint, api);
          response = getResponseParameters(endpoint, api);

          responseCodes = Object.keys(
            api.paths[truepath][method.toLocaleLowerCase()].responses
          );
        } catch (error) {
          console.error("Error parsing OAS document:", error);
        }
      }

      const builderId = request.query.event || mongoEndpoint?._doc.builder_id;

      const builderData = await getBuilder(
        builderId,
        parameters,
        response,
        request.query.event ? true : false
      );
      if (!builderData) throw { error: "NoBuilder", host: host._id };
      const { nodes, edges } = builderData;

      reply.status(200).send({
        issue: false,
        oas: oas,
        builderId: builderId,
        builder: { nodes, edges },
      });
    } catch (error) {
      console.log(error);
      switch (error.error) {
        case "NoHost":
          reply.status(500).send({ message: error.message });
          break;
        case "NoEndpoint":
          reply.status(200).send({ issue: error });
          break;
        case "NoBuilder":
          reply.status(200).send({ issue: error });
          break;
        default:
          reply.status(500).send({ message: error.message });
          break;
      }
    }
  });

  fastify.post("/manage/builder/update", async (request, reply) => {
    try {
      const data1 = await Hosts.find({ forwards: request.body.hostname });
      let host_id = data1[0]._id;
      const endpoint = await Endpoints.find({
        host_id: host_id,
        endpoint: request.body.endpoint,
        method: request.body.method,
      });

      try {
        const dataToSave = await endpoint[0].updateOne({
          builder_id: request.body.builder_id,
        });
        reply.status(200).send(dataToSave);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.post("/manage/builder/node", async (request, reply) => {

    const builderId = request.headers["x-sera-builder"];
    if (builderId) {
      try {
        let nodeDataToBeSaved = request.body;

        if (nodeDataToBeSaved.type == "sendEventNode") {
          const struct = new EventStruc({
            event: "builder-default",
            type: "new Event",
            description: "new event",
            data: {},
          });
          const sendEventNodeId = await struct.save();
          nodeDataToBeSaved.data.struc_id = sendEventNodeId._id;
        }

        const nodedata = new Nodes(nodeDataToBeSaved);
        const savedData = await nodedata.save();

        if (request.query.type == "builder") {
          Builder.findByIdAndUpdate(builderId, {
            $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
          }).then((e) => {
            socket.wsEmit("nodeCreated", {
              node: savedData,
              builder: builderId,
            });
          });
        } else {
          let BuilderModel
          switch(request.query.type){
            case "event": BuilderModel = EventBuilder; break;
            case "integration": BuilderModel = IntegrationBuilder; break;
          }

          
          BuilderModel.findOneAndUpdate(
            { slug: builderId },
            {
              $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
            }
          ).then(async (e) => {

            if (request.query.type == "integration" && JSON.stringify(savedData).includes("replace-host-string")) {
              let newSavedData = JSON.parse(JSON.stringify(savedData).replace("replace-host-string", e.hostname));

              savedData.overwrite(newSavedData);
              const overwrittenSave = await savedData.save(); // Save the modified data to the database
              
              socket.wsEmit("nodeCreated", {
                node: overwrittenSave,
                builder: builderId,
              });
            }else{
              socket.wsEmit("nodeCreated", {
                node: savedData,
                builder: builderId,
              });
            }

            
          });
        }
        reply.status(200).send(savedData);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    }
  });

  fastify.post("/manage/builder/node/delete", async (request, reply) => {
    const builderId = request.headers["x-sera-builder"];
    const nodeId = request.body[0]._id;
    if (!builderId || !nodeId) {
      return reply.status(500).send({ message: "Missing builder ID or node ID" });
    }
    try {
      const deletedNode = await Nodes.findByIdAndDelete(
        new mongoose.Types.ObjectId(nodeId)
      );
      if (!deletedNode) {
        return reply.status(404).send({ message: "Node not found" });
      }

      if (deletedNode.type == "sendEventNode") {
        await EventStruc.findByIdAndDelete(
          new mongoose.Types.ObjectId(deletedNode.data.struc_id)
        );
      }

      if (deletedNode.type == "sendEventNode" || deletedNode.type == "eventNode") {
        await EventBuilder.findOneAndUpdate(
          { slug: builderId },
          {
            $pull: { nodes: deletedNode._id },
          }
        );
      } else {
        await Builder.findByIdAndUpdate(builderId, {
          $pull: { nodes: deletedNode._id },
        });
      }

      await axios.post(`http://localhost:${process.env.BE_SEQUENCER_PORT}/${request.query.type}/${builderId}`, {}, {
        headers: {
          'Content-Type': 'application/json',
          'x-sera-service': "be_sequencer"
        }
      });

      socket.wsEmit("nodeDeleted", {
        node: request.body,
        builder: builderId,
      });
      reply.status(200).send({ message: "Node deleted successfully" });
    } catch (error) {
      console.log(error);
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.post("/manage/builder/edge", async (request, reply) => {
    const builderId = request.headers["x-sera-builder"];
    console.log(builderId)
    if (builderId) {
      try {
        const edgedata = new Edges(request.body);
        const savedData = await edgedata.save();
        savedData.id = savedData._id;
        const finalData = await savedData.save();

        const { target, targetHandle, source } = finalData;

        if (request.body.targetHandle == "seraFunctionEvent") {
          const node = await Nodes.findOne({ id: target });
          if (node) {
            const updateKey = `data.${request.body.sourceHandle}`;
            await EventStruc.findByIdAndUpdate(
              node.data.struc_id,
              {
                $set: {
                  [updateKey]: "string",
                },
              },
              { upsert: true, new: true }
            );
          } else {
            console.log("No corresponding structure found for script id:");
          }
        }

        if (request.body.targetHandle != "seraFunctionEvent" && request.body.targetHandle != "scriptAccept") {
          const edgesToDelete = await Edges.find({ _id: { $ne: savedData._id }, target, targetHandle });
          const idsToDelete = edgesToDelete.map((edge) => edge._id);
          const socketEdgesToDelete = edgesToDelete.map((edge) => ({
            id: edge._id,
            type: "remove",
          }));

          socket.wsEmit("edgeDeleted", {
            edge: socketEdgesToDelete,
            builder: builderId,
          });

          await Edges.deleteMany({ _id: { $in: idsToDelete } });
        }

        if (request.query.type != "builder") {
          let BuilderDB
          switch(request.query.type){
            case "event": BuilderDB = EventBuilder; break;
            case "integration": BuilderDB = EventBuilder; break;
          }

          await BuilderDB.findOneAndUpdate(
            { slug: builderId },
            {
              $push: { edges: new mongoose.Types.ObjectId(finalData._id) },
            }
          );

          if (targetHandle == "sera.sera_start") {
            const nodes = await Nodes.find({ id: { $in: [target, source] } });
            let targetNode = null;
            let sourceNode = null;
            nodes.forEach((nod) => {
              if (nod.id == target) targetNode = nod;
              if (nod.id == source) sourceNode = nod;
            });
            if (targetNode.type == "toastNode") {
              console.log(sourceNode.data.inputData)

              await SeraSettings.findOneAndUpdate(
                { user: "admin" },
                {
                  $push: { toastables: sourceNode.data.inputData },
                }
              );

            }
          }
        }

        try {
          socket.wsEmit("edgeCreated", {
            edge: finalData,
            builder: builderId,
          });

          if (request.query.type == "builder") {
            await Builder.findByIdAndUpdate(builderId, {
              $push: { edges: new mongoose.Types.ObjectId(finalData._id) },
            });
          }

          await axios.post(`http://localhost:${process.env.BE_SEQUENCER_PORT}/${request.query.type}/${builderId}`, {}, {
            headers: {
              'Content-Type': 'application/json',
              'x-sera-service': "be_sequencer"
            }
          });


        } catch (error) {
          console.error('Request error:', error);
          reply.status(500).send('Error updating mapping');
        }


        reply.status(200).send(finalData);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    }
  });

  fastify.patch("/manage/builder/edge", async (request, reply) => {
    const builderId = request.headers["x-sera-builder"];
    if (builderId) {
      try {
        await Edges.findByIdAndUpdate(req.body.id, { ...req.body });
        socket.wsEmit("edgeUpdated", {
          edge: req.body,
          builder: builderId,
        });
        reply.status(200).send();
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    }
  });

  fastify.post("/manage/builder/edge/delete", async (request, reply) => {
    console.log("deletin")

    const builderId = request.headers["x-sera-builder"];
    const edgeId = request.body[0].id;
    if (!builderId || !edgeId) {
      return reply.status(500).send({ message: "Missing builder ID or edge ID" });
    }
    try {
      console.log("deleting edge")
      const deletedEdge = await Edges.findByIdAndDelete(
        new mongoose.Types.ObjectId(edgeId)
      );
      if (!deletedEdge) {
        return reply.status(404).send({ message: "Edge not found" });
      }
      console.log("deleted edge")

      if (deletedEdge.targetHandle == "seraFunctionEvent") {
        const node = await Nodes.findOne({ id: deletedEdge.target });
        if (node) {
          const updateKey = `data.${deletedEdge.sourceHandle}`;
          await EventStruc.findByIdAndUpdate(
            node.data.struc_id,
            {
              $unset: {
                [updateKey]: "",
              },
            },
            { new: true }
          );
        } else {
          console.log("No corresponding structure found for script id:");
        }
      }

      if (request.query.type == "builder") {
        await Builder.findByIdAndUpdate(builderId, {
          $pull: { edges: deletedEdge._id },
        });
      } else {
        await EventBuilder.findOneAndUpdate(
          { slug: builderId },
          {
            $pull: { edges: deletedEdge._id },
          }
        );

        if (deletedEdge.targetHandle == "sera.sera_start") {
          const nodes = await Nodes.find({ id: { $in: [deletedEdge.target, deletedEdge.source] } });
          let targetNode = null;
          let sourceNode = null;
          nodes.forEach((nod) => {
            if (nod.id == deletedEdge.target) targetNode = nod;
            if (nod.id == deletedEdge.source) sourceNode = nod;
          });
          if (targetNode.type == "toastNode") {

            await SeraSettings.findOneAndUpdate(
              { user: "admin" },
              {
                $pull: { toastables: sourceNode.data.inputData },
              }
            );


          }
        }
      }

      await axios.post(`http://localhost:${process.env.BE_SEQUENCER_PORT}/${request.query.type}/${builderId}`, {}, {
        headers: {
          'Content-Type': 'application/json',
          'x-sera-service': "be_sequencer"
        }
      });

      socket.wsEmit("edgeDeleted", {
        edge: request.body,
        builder: builderId,
      });
      reply.status(200).send({ message: "Edge deleted successfully" });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.post("/manage/builder/create", async (request, reply) => {
    try {
      const host = await Hosts.findById(request.body.host_id);
      const parameters = await getFields({
        request,
        hostname: host.hostname,
        oas_id: host.oas_spec,
      });

      console.log(parameters)

      const fields = parameters[0];
      const resFields = parameters[2];
      const template = await BuilderTemplate.findOne({ template: true });

      const truepath = (request.body.hostname + request.body.path).replace(
        host.hostname,
        ""
      );

      let editTemplate = JSON.stringify(template);

      const gen1 = generateRandomString();
      const gen2 = generateRandomString();
      const gen3 = generateRandomString();
      const gen4 = generateRandomString();

      editTemplate = editTemplate.replace(/{{host}}/g, host.hostname);
      editTemplate = editTemplate.replace(/{{method}}/g, request.body.method);
      editTemplate = editTemplate.replace(/{{path}}/g, truepath);

      editTemplate = editTemplate.replace(/{{gen-1}}/g, gen1);
      editTemplate = editTemplate.replace(/{{gen-2}}/g, gen2);
      editTemplate = editTemplate.replace(/{{gen-3}}/g, gen3);
      editTemplate = editTemplate.replace(/{{gen-4}}/g, gen4);
      editTemplate = editTemplate.replace(/{{gen-5}}/g, generateRandomString());
      editTemplate = editTemplate.replace(/{{gen-6}}/g, generateRandomString());

      let finalizedTemplate = JSON.parse(editTemplate);

      Object.keys(fields).forEach((field) => {
        fields[field].forEach((f) => {
          const databayoo = {
            source: gen1,
            sourceHandle: `${field}.${f.name}`,
            target: gen2,
            targetHandle: `${field}.${f.name}`,
            id: `${gen1}-${gen2}-${f.name}-${generateRandomString()}`,
            animated: false,
            style: {
              stroke: getColor(f.schema["type"]),
            },
          };

          finalizedTemplate.edges.push(databayoo);
        });
      });

      Object.keys(resFields).forEach((field) => {
        resFields[field].forEach((f) => {
          const databayoo2 = {
            source: gen3,
            sourceHandle: `${field}.${f.name}`,
            target: gen4,
            targetHandle:
              f.schema["type"] == "null" ? `sera.sera_start` : `${field}.${f.name}`,
            id: `${gen3}-${gen4}-${f.name}-${generateRandomString()}`,
            animated: f.schema["type"] == "null" ? true : false,
            style: {
              stroke: getColor(f.schema["type"]),
            },
          };

          finalizedTemplate.edges.push(databayoo2);
        });
      });

      let nodes;
      let edges;

      try {
        const nodeSavePromises = finalizedTemplate.nodes.map((node) =>
          new Nodes(node).save()
        );
        const savedNodes = await Promise.all(nodeSavePromises);
        nodes = savedNodes.map((savedNode) => savedNode._id);

        const edgeSavePromises = finalizedTemplate.edges.map((edge) =>
          new Edges(edge).save()
        );
        const savedEdges = await Promise.all(edgeSavePromises);
        edges = savedEdges.map((savedEdge) => savedEdge._id);
      } catch (error) {
        console.error("Error saving nodes or edges:", error);
      }

      const data = new Builder({
        edges,
        nodes,
        enabled: true,
      });

      try {
        const dataToSave = await data.save();
        reply.status(200).send(dataToSave);
      } catch (error) {
        console.log("e1", error)
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      console.log("e2", error)

      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/builder/getNode", async (request, reply) => {
    try {
      console.log(request.query.id)
      const node_data = await Nodes.findById(request.query.id);
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/builder/getNodeStruc", async (request, reply) => {
    try {
      const query = { event: request.query.event };
      if (request.query.type) {
        query.type = request.query.type;
        const node_data = await EventStruc.findOne(query);
        reply.send(node_data);
      } else {
        const node_data = await EventStruc.find(query);
        reply.send(node_data);
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });
}

module.exports = fastifyPlugin(routes);