const fastifyPlugin = require('fastify-plugin');
const https = require("https");
const axios = require("axios");
const mongoose = require("mongoose");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const DNS = require("../models/models.dns");
const Builder = require("../models/models.builder");
const BuilderTemplate = require("../models/models.builder_template");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const EventStruc = require("../models/models.eventStruc");

const Converter = require("api-spec-converter");
const yaml = require("js-yaml");
const SwaggerParser = require("@apidevtools/swagger-parser");
const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

async function routes(fastify, options) {
  fastify.post("/manage/host", async (request, reply) => {
    let oas;
    let oasJsonFinal = {};
    try {
      function getSecondToLastElement(hostname) {
        const parts = hostname.split(".");
        return parts.length >= 2 ? parts[parts.length - 2] : null;
      }

      function cleanUrl(url) {
        const pattern = /^(https?:\/\/)?(www\.)?/;
        return url.replace(pattern, "");
      }

      function detectOASVersion(oas) {
        if (oas.openapi) {
          const majorVersion = parseInt(oas.openapi.charAt(0));
          return majorVersion === 3 ? "openapi_3" : "unknown";
        } else if (oas.swagger) {
          const majorVersion = parseInt(oas.swagger.charAt(0));
          return majorVersion === 2 ? "swagger_2" : "swagger_1";
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

      if (!request.body.oas) {
        oas = new OAS({
          openapi: "3.0.1",
          info: {
            title: "Minimal API",
            version: "1.0.0",
          },
          servers: [{ url: request.body.hostname }],
          paths: {},
        });

        oasJsonFinal = {
          openapi: "3.0.1",
          info: {
            title: "Minimal API",
            version: "1.0.0",
          },
          servers: [{ url: request.body.hostname }],
          paths: {},
        };

        hostdomain = getSecondToLastElement(request.body.hostname);
      } else {
        let oasData = request.body.oas;
        if (typeof oasData === "string" && !isJsonString(oasData)) {
          try {
            oasData = yaml.load(oasData);
          } catch (e) {
            return reply
              .status(400)
              .send("Invalid OAS format: Please provide valid JSON or YAML.");
          }
        }

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
          port: request.body.port || 80,
        },
        sera_config: {
          strict: false,
          learn: true,
          https: true,
        },
        hostname: cleanUrl(oasJsonFinal.servers[0].url),
      });

      try {
        const dataToSave = await data.save();
        reply.status(200).send(dataToSave);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    } catch (e) {
      console.warn(e);
    }
  });

  fastify.get("/manage/host", async (request, reply) => {
    try {
      let node_data;
      if (request.query.id) {
        node_data = await Hosts.find({ _id: request.query.id }).populate([
          "oas_spec",
        ]);
      } else {
        node_data = await Hosts.find().populate(["oas_spec"]).limit(100);
      }
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.patch("/manage/host", async (request, reply) => {
    try {
      if (!request.body.host_id) {
        return reply
          .status(400)
          .json({ message: "Missing data for update or host ID." });
      }

      let field = request.body.field;
      let updateObject = { $set: {} };
      updateObject.$set[`sera_config.${field}`] = request.body.key;

      const updatedHost = await Hosts.findByIdAndUpdate(
        request.body.host_id,
        updateObject,
        { new: true }
      );

      if (!updatedHost) {
        return reply.status(404).send({ message: "Host not found." });
      }

      reply.send(updatedHost);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/host/oas", async (request, reply) => {
    try {
      let node_data;
      if (request.query.host) {
        host_data = await Hosts.findOne({ hostname: request.query.host });
        oas_data = await OAS.findOne({ _id: host_data.oas_spec });
        reply.send(oas_data);
      } else {
        oas_data = await OAS.find();
        reply.send(oas_data);
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/host/dns", async (request, reply) => {
    try {
      if (request.query.host) {
        host_data = await Hosts.findOne({ hostname: request.query.host });
        dns_data = await DNS.findOne({ _id: host_data.sera_dns });
        reply.send(dns_data);
      } else {
        reply.status(500).send({ message: "no host provided" });
      }
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

  fastify.get("/manage/info", async (request, reply) => {
    try {
      reply.json({
        method: request.method,
        url: request.url,
        headers: request.headers,
        params: request.params,
        query: request.query,
        body: request.body,
      });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/getNode", async (request, reply) => {
    try {
      const node_data = await Nodes.findById(request.query.id);
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/getNodeStruc", async (request, reply) => {
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

async function getFields({ request, hostname, oas_id }) {
  try {

    const path = request.body.path == "" ? "/" : request.body.path
    const method = request.body.method

    const oas = await OAS.findById(oas_id);

    const oasPathways = [path, method.toLowerCase()];

    const pathwayData = getDataFromPath(oasPathways, oas.paths);

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
    case "number":
      return "#a456e5";
    case "string":
      return "#2bb74a";
    case "array":
      return "#f1ee07";
    case "boolean":
      return "#FF4747";
  }
};
