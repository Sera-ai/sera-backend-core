const fastifyPlugin = require('fastify-plugin');
const IntegrationBuilder = require("../models/models.integrations");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const OAS = require("../models/models.oas");
const { stringToSlug, getBuilder } = require("../helpers/helpers.general")


/**
 * Registers routes for managing builder integrations with the Fastify server.
 *
 * This function sets up several endpoints to create, retrieve, and list builder integrations, along with their corresponding nodes and edges.
 * The available routes are:
 * - POST `/manage/builder/integration`: Creates a new builder integration.
 * - GET `/manage/builder/integration`: Retrieves the details of a specific builder integration by slug.
 * - GET `/manage/builder/integrations`: Lists all available builder integrations.
 * - GET `/manage/builder/integration/plugins`: Lists all plugins (nodes) associated with integrations.
 *
 * @async
 * @function IntegrationRoutes
 * @param {FastifyInstance} fastify - The Fastify instance to register the routes on.
 * @param {Object} options - The options object for route configuration.
 *
 * @route POST /manage/builder/integration
 * @description Creates a new builder integration based on the provided name and hostname.
 * @param {Object} request.body - The request body containing the builder integration details.
 * @param {string} request.body.name - The name of the integration (required).
 * @param {string} [request.body.hostname] - The hostname of the integration (optional).
 * @returns {Object} The slug of the newly created integration.
 * @throws {Error} If the required parameters are missing or the name is duplicated.
 *
 * @route GET /manage/builder/integration
 * @description Retrieves the nodes and edges of a specific builder integration by its slug.
 * @param {Object} request.query - The query parameters for retrieving the integration.
 * @param {string} request.query.slug - The slug of the integration to retrieve.
 * @returns {Object} The nodes and edges associated with the specified integration.
 * @throws {Error} If the integration is not found or an error occurs while retrieving the data.
 *
 * @route GET /manage/builder/integrations
 * @description Retrieves a list of all builder integrations.
 * @returns {Array<Object>} An array of integrations, each containing the name, type, slug, and enabled status.
 * @throws {Error} If an error occurs while retrieving the integrations.
 *
 * @route GET /manage/builder/integration/plugins
 * @description Retrieves all the nodes (plugins) associated with builder integrations.
 * @returns {Array<Object>} An array of plugins (nodes), each containing the name, type, and ID.
 * @throws {Error} If an error occurs while retrieving the plugins.
 */



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