const express = require("express");
const https = require("https");
const axios = require("axios");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const DNS = require("../models/models.dns");
const Builder = require("../models/models.builder");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const Endpoints = require("../models/models.endpoints");
const Plugins = require("../models/models.plugins");
const EventStruc = require("../models/models.eventStruc");
const router = express.Router();

const Converter = require("api-spec-converter");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");
const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

//Post Method
router.post("/host", async (req, res) => {
  let oas;
  let oasJsonFinal = {};
  try {
    function getSecondToLastElement(hostname) {
      const parts = hostname.split(".");
      // Ensure there are at least two parts to return the second to last one
      if (parts.length >= 2) {
        return parts[parts.length - 2];
      } else {
        // Return null or an appropriate value if there's no second to last element
        return null;
      }
    }

    function cleanUrl(url) {
      // This regex matches "http://", "https://", and "www." at the beginning of the string
      const pattern = /^(https?:\/\/)?(www\.)?/;
      return url.replace(pattern, "");
    }

    function detectOASVersion(oas) {
      if (oas.openapi) {
        const majorVersion = parseInt(oas.openapi.charAt(0));
        if (majorVersion === 3) {
          return "openapi_3";
        }
        // Add more conditions here if OpenAPI releases a version 4 or later.
      } else if (oas.swagger) {
        const majorVersion = parseInt(oas.swagger.charAt(0));
        if (majorVersion === 2) {
          return "swagger_2";
        } else if (majorVersion === 1) {
          // Assuming there's a need to specifically identify Swagger version 1.x
          return "swagger_1";
        }
      }
      return "unknown";
    }

    function isJsonString(str) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        return false;
      }
    }

    let hostdomain;

    if (!req.body.oas) {
      oas = new OAS({
        openapi: "3.0.1",
        info: {
          title: "Minimal API",
          version: "1.0.0",
        },
        servers: [{ url: req.body.hostname }],
        paths: {},
      });

      oasJsonFinal = {
        openapi: "3.0.1",
        info: {
          title: "Minimal API",
          version: "1.0.0",
        },
        servers: [{ url: req.body.hostname }],
        paths: {},
      };

      hostdomain = getSecondToLastElement(req.body.hostname);
    } else {
      let oasData = req.body.oas;
      if (typeof oasData === "string" && !isJsonString(oasData)) {
        try {
          // If oasData is a YAML string, parse it to a JS object
          oasData = yaml.load(oasData);
        } catch (e) {
          return res
            .status(400)
            .send("Invalid OAS format: Please provide valid JSON or YAML.");
        }
      }

      // At this point, oasData is a JavaScript object (either from JSON or converted from YAML)
      // Convert it back to JSON string if you need to manipulate or store it as JSON
      const oasJson = oasData;

      const oasversion = detectOASVersion(oasJson);
      if (oasversion == "unknown") throw { error: "unknown oas", oas: oasJson };
      if (oasversion != "openapi_3") {
        Converter.convert(
          {
            from: oasversion,
            to: "openapi_3",
            source: oasJson,
          },
          function (err, converted) {
            oas = new OAS(converted);
            hostdomain = getSecondToLastElement(converted.servers[0].url);

            oasJsonFinal = converted;

            // For yaml and/or OpenApi field order output replace above line
            // with an options object like below
            //   var  options = {syntax: 'yaml', order: 'openapi'}
            //   console.log(converted.stringify(options));
          }
        );
      } else {
        oas = new OAS(oasJson);
        oasJsonFinal = oasJson;

        hostdomain = getSecondToLastElement(oasJson.servers[0].url);
      }
    }

    const oasSave = await oas.save();
    const subdo = `${hostdomain.substring(0, 40)}-${generateRandomString(6)}`;
    const dns = new DNS({
      sera_config: {
        domain: "local.sera",
        expires: null,
        sub_domain: cleanUrl(subdo),
        obfuscated: null,
      },
    });

    const dnsSave = await dns.save();

    const data = new Hosts({
      oas_spec: oasSave._id,
      sera_dns: dnsSave._id,
      frwd_config: {
        host: cleanUrl(hostdomain),
        port: req.body.port || 80,
      },
      sera_config: {
        strict: false,
        learn: true,
        https: true,
      },
      hostname: cleanUrl(oasJsonFinal.servers[0].url),
    });

    const agent = new https.Agent({
      rejectUnauthorized: false,
    });

    axios.post(
      "https://dns.sera:12000/dns",
      { host: cleanUrl(subdo) + ".sera", ip: "127.0.0.1" },
      {
        headers: {
          "Content-Type": "application/json",
          "x-sera-service": "be_Dns",
        },
        httpsAgent: agent,
      }
    );

    try {
      const dataToSave = await data.save();
      res.status(200).json(dataToSave);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  } catch (e) {
    console.warn(e);
  }
});

router.get("/host", async (req, res) => {
  try {
    let node_data;
    // Check if the "id" parameter is provided in the query string
    if (req.query.id) {
      // Fetch the specific record by ID
      node_data = await Hosts.find({ _id: req.query.id }).populate([
        "oas_spec",
      ]);
    } else {
      // Fetch all records, limited to 100
      node_data = await Hosts.find().populate(["oas_spec"]).limit(100);
    }
    res.send(node_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.patch("/host", async (req, res) => {
  try {
    // Ensure there is data to update with and an ID is provided
    if (!req.body.host_id) {
      return res
        .status(400)
        .json({ message: "Missing data for update or host ID." });
    }

    let field = req.body.field;

    let updateObject = { $set: {} };
    updateObject.$set[`sera_config.${field}`] = req.body.key;

    const updatedHost = await Hosts.findByIdAndUpdate(
      req.body.host_id, // find a document by ID
      updateObject,
      { new: true } // Options to return the document after update
    );

    if (!updatedHost) {
      return res.status(404).json({ message: "Host not found." });
    }

    res.send(updatedHost);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/host/oas", async (req, res) => {
  try {
    let node_data;
    // Check if the "id" parameter is provided in the query string
    if (req.query.host) {
      // Fetch the specific record by ID
      host_data = await Hosts.findOne({ hostname: req.query.host });
      oas_data = await OAS.findOne({ _id: host_data.oas_spec });

      res.send(oas_data);
    } else {
      oas_data = await OAS.find();

      res.send(oas_data);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/host/dns", async (req, res) => {
  try {
    let node_data;
    // Check if the "id" parameter is provided in the query string
    if (req.query.host) {
      // Fetch the specific record by ID
      host_data = await Hosts.findOne({ hostname: req.query.host });
      dns_data = await DNS.findOne({ _id: host_data.sera_dns });

      res.send(dns_data);
    } else {
      res.status(500).json({ message: "no host provided" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/builder/create", async (req, res) => {
  //Why do I make two ID's? _id is created by mongo, and this generator makes id. react flow requires an "id" property and using the template style I did below makes it kind of hard to link _id into id
  try {
    const host = await Hosts.findById(req.body.host_id);
    const parameters = await getFields({
      req,
      hostname: host.hostname,
      oas_id: host.oas_spec,
    });

    const fields = parameters[0];
    const resFields = parameters[2];
    const template = await Builder.findOne({ template: true });

    const truepath = (req.body.hostname + req.body.path).replace(
      host.hostname,
      ""
    );

    let editTemplate = JSON.stringify(template);

    const gen1 = generateRandomString();
    const gen2 = generateRandomString();
    const gen3 = generateRandomString();
    const gen4 = generateRandomString();

    editTemplate = editTemplate.replace(/{{host}}/g, host.hostname);
    editTemplate = editTemplate.replace(/{{method}}/g, req.body.method);
    editTemplate = editTemplate.replace(/{{path}}/g, truepath);

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
          sourceHandle: f.name,
          target: gen2,
          targetHandle: f.name,
          id: `${gen1}-${gen2}-${f.name}-${generateRandomString()}`,
          animated: false,
          style: {
            stroke: getColor(f.schema["type"]),
          },
        };

        finalizedTemplate.edges.push(databayoo);
      });
    });

    Object.keys(resFields).map((field, int) => {
      resFields[field].map((f) => {
        const databayoo2 = {
          source: gen3,
          sourceHandle: f.name,
          target: gen4,
          targetHandle: f.schema["type"] == "null" ? `sera_start` : f.name,
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
      // Optionally, log saved edges or their IDs as needed
    } catch (error) {
      console.error("Error saving nodes or edges:", error);
      // Handle the error appropriately
    }

    const data = new Builder({
      edges,
      nodes,
      enabled: true,
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
    res.send(node_data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/getNodeStruc", async (req, res) => {
  try {
    const query = { event: req.query.event };
    if (req.query.type) {
      query.type = req.query.type;
      const node_data = await EventStruc.findOne(query);
      res.send(node_data);
    } else {
      const node_data = await EventStruc.find(query);
      res.send(node_data);
    }
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

function generateRandomString(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}

async function getFields({ req, hostname, oas_id }) {
  try {
    const url =
      "http://" +
      req.body.hostname +
      (req.body.hostname + req.body.path).replace(hostname, "") +
      "/" +
      req.body.method.toLowerCase();
    const parsed = new URL(url);
    const oas = await OAS.findById(oas_id);

    const splitPath = parsed.pathname.split("/").slice(1);
    // Example splitPath array

    // Separate the array into two parts: all elements except the last, and the last element
    const pathWithoutLast = splitPath.slice(0, -1); // This removes the last element
    const lastElement = splitPath[splitPath.length - 1]; // This gets the last element

    // Decode URI components and join the first part with "/", adding the last element back
    const combinedPath =
      "/" + pathWithoutLast.map(decodeURIComponent).join("/");
    const oasPathways = [combinedPath, decodeURIComponent(lastElement)];

    // Resulting oasPathways will be: [ '/items/{itemId}', 'get' ]

    const pathwayData = getDataFromPath(oasPathways, oas.paths);

    const lastSlashIndex = parsed.pathname.lastIndexOf("/");
    const path = decodeURIComponent(
      parsed.pathname.substring(0, lastSlashIndex)
    ); // "boop/boop"
    const method = parsed.pathname.substring(lastSlashIndex + 1).toUpperCase(); // "boop"

    if (pathwayData) {
      const api = await SwaggerParser.parse(oas);

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
