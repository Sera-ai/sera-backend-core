const express = require("express");
const mongoose = require("mongoose");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const SeraSettings = require("../models/models.sera_settings");
const EventStruct = require("../models/models.eventStruc");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const Endpoints = require("../models/models.endpoints");
const Plugins = require("../models/models.plugins");
const router = express.Router();

const SwaggerParser = require("@apidevtools/swagger-parser");
const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

router.get("/", async (req, res) => {
  try {
    let node_data;
    // Check if the "id" parameter is provided in the query string
    if (req.query.id) {
      // Fetch the specific record by ID

      node_data = await Endpoints.find({ _id: req.query.id }).populate([
        "host_id",
        "builder_id",
      ]);
    } else {
      // Fetch all records, limited to 100
      node_data = await Endpoints.find()
        .populate(["host_id", "builder_id"])
        .limit(100);
    }
    res.send(node_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const data1 = await Hosts.findById(req.body.host_id);
    const truepath = (req.body.hostname + req.body.endpoint).replace(
      data1.hostname,
      ""
    );

    let host_id = data1._id;

    const data = new Endpoints({
      host_id: host_id,
      builder_id: req.body.builder_id ?? null,
      endpoint: truepath,
      method: req.body.method,
      sera_config: {
        debug: true,
        rely: false,
      },
    });

    try {
      const dataToSave = await data.save();
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/builder", async (req, res) => {
  let endpoint;
  let parameters = {};
  let response = {};
  let responseCodes = [];
  let mongoEndpoint = null;
  let oas = null;
  let host = null;

  try {
    if (req.query.path) {
      const url = "http:/" + decodeURIComponent(req.query.path);
      const parsed = new URL(url);
      const oasUrl = `${parsed.protocol}//${parsed.host}`;

      const lastSlashIndex = parsed.pathname.lastIndexOf("/");
      const path = decodeURIComponent(
        parsed.pathname.substring(0, lastSlashIndex)
      ); // "boop/boop"
      const method = parsed.pathname
        .substring(lastSlashIndex + 1)
        .toUpperCase(); // "boop"

      const substringToMatch = parsed.host.split(":")[0];

      const matchingOas = await OAS.find({
        "servers.url": { $regex: substringToMatch },
      });

      // Assuming substringToMatch would be something like "reqres.in"
      const matchingHosts = await Hosts.find({
        hostname: { $regex: substringToMatch },
      });

      // Remove protocol and extract only the domain and path without query parameters
      const normalizedUrl = url.replace(/^https?:\/\//, "").split("?")[0];

      let bestMatch = null;
      let bestMatchLength = 0;
      let bestMatchLength2 = 0;

      matchingOas.forEach((searchedOas) => {
        searchedOas.servers.forEach((server) => {
          // Normalize server URL for comparison
          const serverUrlNormalized = server.url.replace(/^https?:\/\//, "");

          // Check if the domain of the server URL matches the start of the normalized URL
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
        // Check how much of the start of the normalized URL is matched by the hostname
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

      const truepath = (parsed.host + path).replace(host.hostname, "");

      mongoEndpoint = await Endpoints.findOne({
        host_id: host._id,
        endpoint: truepath,
        method: method,
      });
      if (!mongoEndpoint) throw { error: "NoEndpoint", host: host._id };

      const { ...parseableOas } = oas;

      try {
        const api = await SwaggerParser.parse(oas);

        endpoint = api.paths[truepath][method.toLocaleLowerCase()];

        parameters = getRequestParameters(endpoint, api);
        response = getResponseParameters(endpoint, api);

        // Assuming request headers are defined under `parameters` with `"in": "header"`

        // For demonstration, accessing response headers of the first response code
        responseCodes = Object.keys(
          api.paths[truepath][method.toLocaleLowerCase()].responses
        );
      } catch (error) {
        console.error("Error parsing OAS document:", error);
      }
    }

    const builderId = req.query.event || mongoEndpoint?._doc.builder_id;

    //const oas = await OAS.findById(host._doc.oas_spec);
    const builderData = await getBuilder(
      builderId,
      parameters,
      response,
      req.query.event ? true : false
    );
    if (!builderData) throw { error: "NoBuilder", host: host?._id };
    const { nodes, edges } = builderData;

    res.status(200).json({
      issue: false,
      oas: oas,
      builderId: builderId,
      builder: { nodes, edges },
    });
  } catch (error) {
    console.log(error);
    switch (error.error) {
      case "NoHost":
        res.status(500).json({ message: error.message });
        break;
      case "NoEndpoint":
        res.status(200).json({ issue: error });
        break;
      case "NoBuilder":
        res.status(200).json({ issue: error });
        break;
      default:
        res.status(500).json({ message: error.message });
        break;
    }
  }
});

router.post("/update", async (req, res) => {
  try {
    const data1 = await Hosts.find({ forwards: req.body.hostname });
    let host_id = data1[0]._id;
    const endpoint = await Endpoints.find({
      host_id: host_id,
      endpoint: req.body.endpoint,
      method: req.body.method,
    });

    try {
      const dataToSave = await endpoint[0].updateOne({
        builder_id: req.body.builder_id,
      });
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/node", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  if (builderId) {
    try {
      let nodeDataToBeSaved = req.body;
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

      if (req.query.type != "event") {
        Builder.findByIdAndUpdate(builderId, {
          $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
        }).then((e) => {
          //create socket interaction
          //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
          req.socket.emit("nodeCreated", {
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
          //create socket interaction
          //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
          req.socket.emit("nodeCreated", {
            node: savedData,
            builder: builderId,
          });
        });
      }
      res.status(200);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.delete("/node", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  const nodeId = req.body[0]._id;
  if (!builderId || !nodeId) {
    return res.status(500).json({ message: "Missing builder ID or node ID" });
  }
  try {
    const deletedNode = await Nodes.findByIdAndDelete(
      new mongoose.Types.ObjectId(nodeId)
    );
    if (!deletedNode) {
      return res.status(404).json({ message: "Node not found" });
    }

    if (deletedNode.type == "sendEventNode") {
      const deletedENode = await EventStruct.findByIdAndDelete(
        new mongoose.Types.ObjectId(deletedNode.data.struc_id)
      );
    }

    if (
      deletedNode.type == "sendEventNode" ||
      deletedNode.type == "eventNode"
    ) {
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

    req.socket.emit("nodeDeleted", {
      node: req.body,
      builder: builderId,
    });
    res.status(200).json({ message: "Node deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/edge", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  if (builderId) {
    try {
      const edgedata = new Edges(req.body);
      const savedData = await edgedata.save();
      // Set the id field to match _id after the initial save
      savedData.id = savedData._id;
      const finalData = await savedData.save();

      const { target, targetHandle, source } = finalData;

      if (req.body.targetHandle == "seraFunctionEvent")
        Nodes.findOne({ id: target }).then((node) => {
          console.log("e", node);
          const updateKey = `data.${req.body.sourceHandle}`;

          if (node) {
            console.log(updateKey);
            EventStruct.findByIdAndUpdate(
              node.data.struc_id,
              {
                $set: {
                  [updateKey]: "string", // Ensures 'data' exists and adds/updates 'edge.sourceHandle'
                },
              },
              { upsert: true, new: true } // Options to create the document if not exists and return the updated document
            )
              .then((deleteResult) => {
                // Logging the result of the delete operation
                console.log(deleteResult);
              })
              .catch((error) => {
                console.error(error);
              });
          } else {
            console.log("No corresponding structure found for script id:");
          }
        });

      if (req.body.targetHandle != "seraFunctionEvent")
        if (req.body.targetHandle != "scriptAccept") {
          Edges.find({ _id: { $ne: savedData._id }, target, targetHandle })
            .then((edgesToDelete) => {
              // Now that you have the documents, you can emit them to the socket

              // Convert fetched documents into an array of their IDs
              const idsToDelete = edgesToDelete.map((edge) => edge._id);
              const socketEdgesToDelete = edgesToDelete.map((edge) => ({
                id: edge._id,
                type: "remove",
              }));

              req.socket.emit("edgeDeleted", {
                edge: socketEdgesToDelete,
                builder: builderId,
              });

              // Delete all documents that were fetched
              return Edges.deleteMany({ _id: { $in: idsToDelete } });
            })
            .then((deleteResult) => {
              // Logging the result of the delete operation
              console.log(deleteResult);
            })
            .catch((error) => {
              console.error(error);
            });
        }

      if (req.query.type != "event") {
        Builder.findByIdAndUpdate(builderId, {
          $push: { edges: new mongoose.Types.ObjectId(finalData._id) },
        }).then((e) => {
          //create socket interaction
          //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
          req.socket.emit("edgeCreated", {
            edge: finalData,
            builder: builderId,
          });
        });
      } else {
        EventBuilder.findOneAndUpdate(
          { slug: builderId },
          {
            $push: { edges: new mongoose.Types.ObjectId(finalData._id) },
          }
        ).then((e) => {
          //create socket interaction
          //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
          req.socket.emit("edgeCreated", {
            edge: finalData,
            builder: builderId,
          });
        });

        if (targetHandle == "sera_start")
          Nodes.find({ id: { $in: [target, source] } })
            .then((nodes) => {
              let targetNode = null;
              let sourceNode = null;
              nodes.map((nod) => {
                if (nod.id == target) targetNode = nod;
                if (nod.id == source) sourceNode = nod;
              });
              if (targetNode.type == "toastNode") {
                SeraSettings.findOneAndUpdate(
                  { user: "admin" },
                  {
                    $push: { toastables: sourceNode.data.inputData },
                  }
                ).then((e) => {
                  console.log(e);
                });
              }
            })
            .catch((error) => {
              console.error("Error fetching nodes:", error);
            });
      }

      res.status(200);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.patch("/edge", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  if (builderId) {
    try {
      Edges.findByIdAndUpdate(req.body.id, {
        ...req.body,
      }).then((e) => {
        req.socket.emit("edgeUpdated", {
          edge: req.body,
          builder: builderId,
        });
      });

      res.status(200);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.delete("/edge", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  const edgeId = req.body[0].id;
  if (!builderId || !edgeId) {
    return res.status(500).json({ message: "Missing builder ID or edge ID" });
  }
  try {
    const deletedEdge = await Edges.findByIdAndDelete(
      new mongoose.Types.ObjectId(edgeId)
    );
    if (!deletedEdge) {
      return res.status(404).json({ message: "Edge not found" });
    }

    if (deletedEdge.targetHandle == "seraFunctionEvent") {
      Nodes.findOne({ id: deletedEdge.target })
        .then((node) => {
          const updateKey = `data.${deletedEdge.sourceHandle}`;

          if (node) {
            EventStruct.findByIdAndUpdate(
              node.data.struc_id,
              {
                $unset: {
                  [updateKey]: "", // Removes the specified field
                },
              },
              { new: true } // Returns the updated document
            )
              .then((updatedDoc) => {
                console.log("Updated Document after unset:", updatedDoc);
              })
              .catch((err) => {
                console.error("Error updating document:", err);
              });
          } else {
            console.log("No corresponding structure found for script id:");
          }
        })
        .catch((err) => {
          console.error("Error fetching node:", err);
        });
    }

    if (req.query.type != "event") {
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

      if (deletedEdge.targetHandle == "sera_start")
        Nodes.find({ id: { $in: [deletedEdge.target, deletedEdge.source] } })
          .then((nodes) => {
            let targetNode = null;
            let sourceNode = null;
            nodes.map((nod) => {
              if (nod.id == deletedEdge.target) targetNode = nod;
              if (nod.id == deletedEdge.source) sourceNode = nod;
            });
            if (targetNode.type == "toastNode") {
              SeraSettings.findOneAndUpdate(
                { user: "admin" },
                {
                  $pull: { toastables: sourceNode.data.inputData },
                }
              ).then((e) => {
                console.log(e);
              });
            }
          })
          .catch((error) => {
            console.error("Error fetching nodes:", error);
          });
    }

    req.socket.emit("edgeDeleted", {
      edge: req.body,
      builder: builderId,
    });
    res.status(200).json({ message: "Edge deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

async function getBuilder(builderId, parameters, response, event = false) {
  // First, find the builder_inventory document by its ID

  const inventoryRes = event
    ? await EventBuilder.findOne({ slug: builderId })
    : await Builder.findById(builderId);

  if (!inventoryRes) {
    console.log("Builder inventory not found");
    return;
  }
  // Extract Object IDs from nodes and edges, converting them to Mongoose Object IDs
  const nodeIds = inventoryRes.nodes.map(
    (node) => new mongoose.Types.ObjectId(node._id)
  );
  const edgeIds = inventoryRes.edges.map(
    (edge) => new mongoose.Types.ObjectId(edge._id)
  );

  // Now retrieve all nodes and edges using $in operator
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

  // nodes and edges now contain the documents corresponding to the IDs in builder_inventory
  return { nodes, edges };
}
