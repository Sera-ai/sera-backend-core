const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");
const axios = require("axios");
const SwaggerParser = require("@apidevtools/swagger-parser");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const SeraSettings = require("../models/models.sera_settings");
const EventStruct = require("../models/models.eventStruc");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const Endpoints = require("../models/models.endpoints");

const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

async function routes(fastify, options) {
  fastify.get("/manage/endpoint", async (request, reply) => {
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

  fastify.post("/manage/endpoint", async (request, reply) => {
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

  fastify.get("/manage/endpoint/builder", async (request, reply) => {
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

  fastify.post("/manage/endpoint/update", async (request, reply) => {
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

  fastify.post("/manage/endpoint/node", async (request, reply) => {
    const builderId = request.headers["x-sera-builder"];
    if (builderId) {
      try {
        let nodeDataToBeSaved = request.body;
        console.log(nodeDataToBeSaved);

        if (nodeDataToBeSaved.type == "sendEventNode") {
          const struct = new EventStruct({
            event: "builder-default",
            type: "new Event",
            description: "new event",
            data: {},
          });
          const sendEventNodeId = await struct.save();
          nodeDataToBeSaved.data.struc_id = sendEventNodeId._id;
        }

        console.log(nodeDataToBeSaved);

        const nodedata = new Nodes(nodeDataToBeSaved);
        const savedData = await nodedata.save();

        if (request.query.type != "event") {
          Builder.findByIdAndUpdate(builderId, {
            $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
          }).then((e) => {
            socket.wsEmit("nodeCreated", {
              node: savedData,
              builder: builderId,
            });
          });
        } else {
          EventBuilder.findOneAndUpdate(
            { slug: builderId },
            {
              $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
            }
          ).then((e) => {
            socket.wsEmit("nodeCreated", {
              node: savedData,
              builder: builderId,
            });
          });
        }
        reply.status(200).send(savedData);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    }
  });

  fastify.post("/manage/endpoint/node/delete", async (request, reply) => {
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
        await EventStruct.findByIdAndDelete(
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

  fastify.post("/manage/endpoint/edge", async (request, reply) => {
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
            await EventStruct.findByIdAndUpdate(
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

        if (request.query.type == "event") {
          await EventBuilder.findOneAndUpdate(
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

          if (request.query.type != "event") {
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

  fastify.patch("/manage/endpoint/edge", async (request, reply) => {
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

  fastify.post("/manage/endpoint/edge/delete", async (request, reply) => {
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
          await EventStruct.findByIdAndUpdate(
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

      if (request.query.type != "event") {
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
}

module.exports = fastifyPlugin(routes);

async function getBuilder(builderId, parameters, response, event = false) {
  const inventoryRes = event
    ? await EventBuilder.findOne({ slug: builderId })
    : await Builder.findById(builderId);

  if (!inventoryRes) {
    console.log("Builder inventory not found");
    return;
  }

  const nodeIds = inventoryRes.nodes.map(
    (node) => new mongoose.Types.ObjectId(node._id)
  );
  const edgeIds = inventoryRes.edges.map(
    (edge) => new mongoose.Types.ObjectId(edge._id)
  );

  const nodes = await Nodes.find({
    _id: { $in: nodeIds },
  });

  nodes.forEach((node) => {
    if (node?.data?.headerType) {
      if (node.data.headerType == 1) {
        node.data.out = parameters;
      } else if (node.data.headerType == 2) {
        node.data.in = parameters;
      } else if (node.data.headerType == 3) {
        node.data.out = response;
      } else if (node.data.headerType == 4) {
        let copyResponse = JSON.parse(JSON.stringify(response));
        delete copyResponse["Status Codes"];
        node.data.in = copyResponse;
      }
    }
  });

  const edges = (
    await Edges.find({
      _id: { $in: edgeIds },
    }).lean()
  ).map((edge) => ({
    ...edge,
    id: edge._id.toString(),
  }));

  return { nodes, edges };
}
