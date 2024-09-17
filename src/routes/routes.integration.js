/**
 * @module ManageIntegrations
 * @description API endpoints for managing integration builders and plugins.
 */

const fastifyPlugin = require('fastify-plugin');
const IntegrationBuilder = require("../models/models.integrations");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const OAS = require("../models/models.oas");
const { stringToSlug, getBuilder } = require("../helpers/helpers.general")



async function routes(fastify, options) {
  /**
   * @name POST /manage/builder/integration
   * @description Create a new integration builder.
   * @param {object} body - Contains the name, hostname, and other optional fields for the integration.
   * @return {slug} **string** - The slug of the created integration.
   * @example
   * POST /manage/builder/integration
   */
  fastify.post("/manage/builder/integration", async (request, reply) => {
    try {
      const data = await request.file();  // Parse the file from multipart form-data
      const parts = request.parts();      // Parse form fields
      let fields = {};

      for await (const part of parts) {
        if (!part.file) {
          fields[part.fieldname] = part.value; // Collect form fields
        }
      }

      if (!fields.name) throw new Error("Required parameters missing");

      let integration_data = {
        name: fields.name,
        slug: stringToSlug(fields.name),
        type: "API Endpoint",
        hostname: fields.hostname ?? "",
        nodes: [],
        edges: [],
        enabled: true,
        image: null
      };

      const slugCheck = await IntegrationBuilder.find({ slug: integration_data.slug });
      if (slugCheck.length > 0) throw new Error("Name duplicate");

      // Process the uploaded file (if needed)
      if (data && data.file) {
        // Example: Save the file using GridFS or some other method
        const fileId = await saveFileToGridFS(data.file, data.filename);
        integration_data.image = fileId;  // Store the file reference in the integration_data
      }

      const integrationData = new IntegrationBuilder(integration_data);
      const savedData = await integrationData.save();
      savedData.id = savedData._id;

      reply.send({ slug: savedData.slug });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });


  /**
   * @name GET /manage/builder/integration
   * @description Fetch details of a specific integration builder by slug.
   * @param {string} [slug] - Slug of the integration to fetch.
   * @return {builder} **object** - Builder details including nodes and edges.
   * @example
   * GET /manage/builder/integration?slug=integration-slug
   */
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
        2
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

  /**
   * @name GET /manage/builder/integrations
   * @description Fetch a list of all integration builders.
   * @return {transformedData} **array** - A list of integration builders with names, types, and slugs.
   * @example
   * GET /manage/builder/integrations
   */
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

  /**
   * @name GET /manage/builder/integration/plugins
   * @description Fetch plugins associated with all integration builders.
   * @return {transformedData} **array** - A list of plugins associated with integration builders.
   * @example
   * GET /manage/builder/integration/plugins
   */
  fastify.get("/manage/builder/integration/plugins", async (request, reply) => {
    try {
      const node_data = await IntegrationBuilder.find().populate(["nodes"]);

      const transformedData = []

      node_data.map((item) => {
        item.nodes.forEach((node) => {
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

  fastify.post("/manage/builder/integration/icon", async (request, reply) => {
    const parts = req.parts();

    for await (const part of parts) {
      if (part.file) {
        const uploadStream = bucket.openUploadStream(part.filename, {
          contentType: part.mimetype,
        });
        await pump(part.file, uploadStream);
        reply.send({ message: 'File uploaded successfully to MongoDB GridFS' });
      }
    }
  });
}

module.exports = fastifyPlugin(routes);