const express = require("express");

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

//Post Method
router.post("/host/create", async (req, res) => {
  const data = new Hosts({
    hostname: [req.body.hostname],
    port: req.body.port,
  });

  try {
    const dataToSave = await data.save();
    res.status(200).json(dataToSave);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/node/create", async (req, res) => {
  const data = new Nodes({
    fields: { in: {}, out: req.body.out },
    headerType: false,
    function: req.body.out.__type.replace("__", ""),
    inputData: null,
    nodeType: 0,
  });

  try {
    const dataToSave = await data.save();
    console.log(dataToSave);
    res.status(200).json(dataToSave);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.post("/builder/create", async (req, res) => {

  //Why do I make two ID's? _id is created by mongo, and this generator makes id. react flow requires an "id" property and using the template style I did below makes it kind of hard to link _id into id
  try {
    const parameters = await getFields(req);
    const fields = parameters[0];
    const resFields = parameters[2];
    const template = (await Builder.find({ template: true }))[0]._doc;

    let editTemplate = JSON.stringify(template);

    const gen1 = generateRandomString();
    const gen2 = generateRandomString();
    const gen3 = generateRandomString();
    const gen4 = generateRandomString();

    editTemplate = editTemplate.replace(/{{host}}/g, req.body.hostname);
    editTemplate = editTemplate.replace(/{{method}}/g, req.body.method);
    editTemplate = editTemplate.replace(/{{path}}/g, req.body.path);

    editTemplate = editTemplate.replace(/{{gen-1}}/g, gen1);
    editTemplate = editTemplate.replace(/{{gen-2}}/g, gen2);
    editTemplate = editTemplate.replace(/{{gen-3}}/g, gen3);
    editTemplate = editTemplate.replace(/{{gen-4}}/g, gen4);
    editTemplate = editTemplate.replace(/{{gen-5}}/g, generateRandomString());
    editTemplate = editTemplate.replace(/{{gen-6}}/g, generateRandomString());

    let finalizedTemplate = JSON.parse(editTemplate);

    Object.keys(fields).map((field, int) => {
      fields[field].map((f) => {
        const databayoo = {
          source: gen1,
          sourceHandle: `flow-source-${gen1}-(${f.name})`,
          target: gen2,
          targetHandle: `flow-target-${gen2}-(${f.name})`,
          type: "param",
          id: `${gen1}-${gen2}-${f.name}-${generateRandomString()}`,
          animated: false,
          style: {
            stroke: getColor(f.schema["type"]),
          },
          selected: false,
        };

        finalizedTemplate.edges.push(databayoo);
      });
    });

    Object.keys(resFields).map((field, int) => {
      resFields[field].map((f) => {
        const databayoo2 = {
          source: gen3,
          sourceHandle: `flow-source-${gen3}-(${f.name})`,
          target: gen4,
          targetHandle: `flow-target-${gen4}-${
            f.schema["type"] == "null" ? `start` : `(${f.name})`
          }`,
          type: "param",
          id: `${gen3}-${gen4}-${f.name}-${generateRandomString()}`,
          animated: f.schema["type"] == "null" ? true : false,
          style: {
            stroke: getColor(f.schema["type"]),
          },
          selected: false,
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
      // Optionally, log saved edges or their IDs as needed
    } catch (error) {
      console.error("Error saving nodes or edges:", error);
      // Handle the error appropriately
    }

    const data = new Builder({
      edges,
      nodes,
    });

    try {
      const dataToSave = await data.save();
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/plugins/create", async (req, res) => {
  try {
    let ownerData;
    let ep = false;
    const data1 = await Hosts.findById(req.body.owner_id);
    if (!data1) {
      const searc = await Endpoints.findById(req.body.owner_id);
      ep = true;
      ownerData = searc;
    } else {
      ownerData = data1;
    }

    const collectionSearch = ep ? Endpoints : Hosts;
    const orderBase = collectionSearch.find({ owner_id: req.body.owner_id });

    const data = new Plugins({
      owner_id: ownerData._id,
      endpoint: req.body.endpoint,
      order: (await orderBase).length + 1,
      breakable: req.body.breakable,
      method: req.body.method,
    });

    try {
      const dataToSave = await data.save();
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/plugouts/create", async (req, res) => {
  try {
    let ownerData;
    let ep = false;
    const data1 = await Hosts.findById(req.body.owner_id);
    if (!data1) {
      const searc = await Endpoints.findById(req.body.owner_id);
      ep = true;
      ownerData = searc;
    } else {
      ownerData = data1;
    }

    const collectionSearch = ep ? Endpoints : Hosts;
    const orderBase = collectionSearch.find({ owner_id: req.body.owner_id });

    const data = new Plugins({
      owner_id: ownerData._id,
      endpoint: req.body.endpoint,
      order: (await orderBase).length + 1,
      breakable: req.body.breakable,
      method: req.body.method,
    });

    try {
      const dataToSave = await data.save();
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/info", async (req, res) => {
  try {
    res.json({
      method: req.method,
      url: req.url,
      headers: req.headers,
      params: req.params,
      query: req.query,
      body: req.body,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.get("/getNode", async (req, res) => {
  try {
    const node_data = await Nodes.findById(req.query.id);
    console.log(node_data);
    res.send(node_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

function getDataFromPath(arr, obj) {
  let currentObj = obj;

  for (let i = 0; i < arr.length; i++) {
    const key = arr[i];
    if (key in currentObj) {
      currentObj = currentObj[key];
    } else {
      return null; // key not found in object
    }
  }

  return currentObj; // Return the data from the last key in the array
}

function generateRandomString() {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

async function getFields(req) {
  try {
    const url =
      "http://" +
      req.body.hostname +
      req.body.path +
      "/" +
      req.body.method.toLowerCase();
    console.log(url);
    const parsed = new URL(url);
    const oasUrl = `${parsed.protocol}//${parsed.host}`;
    const oas = (
      await OAS.findOne({ servers: { $elemMatch: { url: oasUrl } } })
    ).toObject();

    const { _id: removedId, ...parseableOas } = oas;

    const splitPath = parsed.pathname.split("/").slice(1);
    const oasPathways = splitPath.map((path, index) => {
      return index === splitPath.length - 1 ? path : "/" + path;
    });

    const pathwayData = getDataFromPath(oasPathways, oas.paths);

    const lastSlashIndex = parsed.pathname.lastIndexOf("/");
    const path = parsed.pathname.substring(0, lastSlashIndex); // "boop/boop"
    const method = parsed.pathname.substring(lastSlashIndex + 1).toUpperCase(); // "boop"

    if (method === "POST" && pathwayData) {
      const api = await SwaggerParser.parse(parseableOas);
      let endpoint = api.paths[path][method.toLocaleLowerCase()];
      const response = getResponseParameters(endpoint, oas);
      const parameters = getRequestParameters(endpoint, oas);
      return [parameters, method, response];
    } else {
      return [null, method];
    }
  } catch (e) {
    console.log(e);
  }
}

const getColor = (type) => {
  switch (type) {
    case "integer":
      return "#a456e5";
    case "string":
      return "#2bb74a";
    case "array":
      return "#f1ee07";
    case "boolean":
      return "#FF4747";
  }
};
