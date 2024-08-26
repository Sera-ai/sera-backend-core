const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");
const axios = require("axios");
const SwaggerParser = require("@apidevtools/swagger-parser");

const OAS = require("../models/models.oas");
const IntegrationBuilder = require("../models/models.integrations");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");

const {
  getRequestParameters,
  getResponseParameters,
} = require("../helpers/helpers.oas");

async function routes(fastify, options) {
  fastify.post("/manage/builder/integration", async (request, reply) => {
    try {
      if (!request.body.name) throw new Error("required parameters missing");
      
      let integration_data = {
        name: request.body.name,
        slug: stringToSlug(request.body.name),
        type: "API Endpoint",
        hostname: request.body.hostname ?? "",
        nodes: [],
        edges: [],
        enabled: true
      };

      const slugCheck = await IntegrationBuilder.find({ slug: integration_data.slug })
      if(slugCheck.length > 0) throw new Error("Name duplicate")

      const integrationData = new IntegrationBuilder(integration_data);
      const savedData = await integrationData.save();
      savedData.id = savedData._id;


      reply.send({slug: savedData.slug});
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/builder/integration", async (request, reply) => {
    let parameters = {};
    let response = {};
    let oas = null;
    let host = null;

    try {
      const builderId = request.query.slug;
      const builderData = await getBuilder(
        builderId,
        parameters,
        response,
      );
      if (!builderData) throw { error: "NoBuilder", host: host._id };
      const { nodes, edges } = builderData;

      reply.status(200).send({
        issue: false,
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

  fastify.get("/manage/builder/integrations", async (request, reply) => {
    try {
      const node_data = await IntegrationBuilder.find();

      const transformedData = node_data.map((item) => {
        return {
          name: `[${item.name}][/builder/integration/${item.slug}]`,
          type: item.type,
          slug: item.slug,
          enabled: item.enabled,
        };
      });

      reply.send(transformedData);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/builder/integration/plugins", async (request, reply) => {
    try {
      const node_data = await IntegrationBuilder.find().populate(["nodes"]);

      const transformedData = []

      node_data.map((item) => {
        item.nodes.forEach((node)=>{
          transformedData.push({
            name: node.data.inputData.name || (item.hostname + (node.data.inputData.endpoint || "/")),
            type: node.data.function,
            id: node._id
          })
        })
      });

      reply.send(transformedData);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });
}

module.exports = fastifyPlugin(routes);

async function getBuilder(builderId, parameters, response) {
  const inventoryRes = await IntegrationBuilder.findOne({ slug: builderId })

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

function stringToSlug(str) {
  return str
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with a single hyphen
    .trim(); // Trim leading/trailing spaces and hyphens
}