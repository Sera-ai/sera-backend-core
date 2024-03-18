const express = require("express");
const mongoose = require("mongoose");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
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
    const url = "http:/" + req.query.path;
    console.log(url);
    const parsed = new URL(url);
    const oasUrl = `${parsed.protocol}//${parsed.host}`;

    const lastSlashIndex = parsed.pathname.lastIndexOf("/");
    const path = parsed.pathname.substring(0, lastSlashIndex); // "boop/boop"
    const method = parsed.pathname.substring(lastSlashIndex + 1).toUpperCase(); // "boop"
    const oas = (
      await OAS.findOne({ servers: { $elemMatch: { url: oasUrl } } })
    ).toObject();

    const host = (await Hosts.find({ forwards: parsed.host.split(":")[0] }))[0];
    if (!host) throw { error: "NoHost" };

    const endpoint = (
      await Endpoints.find({
        host_id: host._id,
        endpoint: path,
        method: method,
      })
    )[0];
    if (!endpoint) throw { error: "NoEndpoint", host: host._id };

    const { _id: removedId, ...parseableOas } = oas;
    let parameters = {};
    let response = {};
    let responseCodes = [];

    try {
      const api = await SwaggerParser.parse(parseableOas);

      let endpoint = api.paths[path][method.toLocaleLowerCase()];

      parameters = getRequestParameters(endpoint, api);
      response = getResponseParameters(endpoint, api);

      // Assuming request headers are defined under `parameters` with `"in": "header"`

      // For demonstration, accessing response headers of the first response code
      responseCodes = Object.keys(
        api.paths[path][method.toLocaleLowerCase()].responses
      );
    } catch (error) {
      console.error("Error parsing OAS document:", error);
    }

    //const oas = await OAS.findById(host._doc.oas_spec);
    const builderData = await getBuilder(
      endpoint._doc.builder_id,
      parameters,
      response
    );
    if (!builderData) throw { error: "NoBuilder", host: host._id };
    const { nodes, edges } = builderData;

    res.status(200).json({
      issue: false,
      oas: oas,
      builderId: endpoint._doc.builder_id,
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

router.post("/create", async (req, res) => {
  try {
    const data1 = await Hosts.find({ forwards: req.body.hostname });

    let host_id = data1[0]._id;

    const data = new Endpoints({
      host_id: host_id,
      endpoint: req.body.endpoint,
      method: req.body.method,
      debug: true,
      rely: false,
      builder_id: req.body.builder_id ?? null,
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
      const nodedata = new Nodes(req.body);
      const savedData = await nodedata.save();

      Builder.findByIdAndUpdate(builderId, {
        $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
      }).then((e) => {
        //create socket interaction
        //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
        req.socket.emit("nodeCreated", { node: savedData, builder: builderId });
      });
      res.status(200);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.delete("/node", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  const nodeId = req.body[0]._id;
  console.log(req.body);
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

    await Builder.findByIdAndUpdate(builderId, {
      $pull: { nodes: deletedNode._id },
    });

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

      Builder.findByIdAndUpdate(builderId, {
        $push: { edges: new mongoose.Types.ObjectId(savedData._id) },
      }).then((e) => {
        //create socket interaction
        //socket.broadcast.to(builder).emit("nodeCreate", { newNode: savedData });
        req.socket.emit("edgeCreated", { edge: savedData, builder: builderId });
      });
      res.status(200);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
});

router.patch("/edge", async (req, res) => {
  const builderId = req.get("x-sera-builder");
  if (builderId) {
    console.log(req.body);
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
  console.log(req.body);
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

    await Builder.findByIdAndUpdate(builderId, {
      $pull: { edges: deletedEdge._id },
    });

    req.socket.emit("edgeDeleted", {
      edge: req.body,
      builder: builderId,
    });
    res.status(200).json({ message: "Edge deleted successfully" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

async function getBuilder(builderId, parameters, response) {
  // First, find the builder_inventory document by its ID
  const builderInventory = await Builder.findById(builderId);
  if (!builderInventory) {
    console.log("Builder inventory not found");
    return;
  }
  // Extract Object IDs from nodes and edges, converting them to Mongoose Object IDs
  const nodeIds = builderInventory.nodes.map(
    (node) => new mongoose.Types.ObjectId(node._id)
  );
  const edgeIds = builderInventory.edges.map(
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
    id: edge._id,
  }));
  // nodes and edges now contain the documents corresponding to the IDs in builder_inventory
  return { nodes, edges };
}
