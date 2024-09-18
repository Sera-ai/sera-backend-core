/**
 * @module ManageIntegrations
 * @description API endpoints for managing integration builders and plugins.
 */

const mongoose = require("mongoose");
const fastifyPlugin = require('fastify-plugin');
const IntegrationBuilder = require("../models/models.integrations");
const GridFsFile = require("../models/models.GridFsFile");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const OAS = require("../models/models.oas");
const { stringToSlug, getBuilder } = require("../helpers/helpers.general")



async function routes(fastify, options) {
  const attachment = options.attachment;  // Access the GridFS stream instance

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
      const parts = request.parts();  // Parse multipart form data (fields + files)
      let fields = {};
      let fileId = null;
  
      for await (const part of parts) {
        if (part.file) {
          // Handle file upload with mongoose-gridfs and wrap it in a promise to await completion
          fileId = await new Promise((resolve, reject) => {
            const writeStream = attachment.createWriteStream({
              filename: part.filename,
              contentType: part.mimetype || 'application/octet-stream' // Default to binary content-type
            });
  
            // Pipe the file stream into the GridFS write stream
            part.file.pipe(writeStream);
  
            // Capture the file's ObjectId when the stream finishes
            writeStream.on('finish', () => {
              console.log('File uploaded with ID:', writeStream.id);
              resolve(writeStream.id);  // Resolve with the file's ObjectId
            });
  
            // Handle stream errors
            writeStream.on('error', (error) => {
              reject(new Error('Error writing file to GridFS: ' + error.message));
            });
          });
        } else {
          // Collect form fields
          fields[part.fieldname] = part.value;
        }
      }
  
      if (!fileId) {
        throw new Error("No file uploaded");
      }
  
      // Create and save the new integration using the collected form fields and file reference
      const integration_data = {
        name: fields.name,
        slug: stringToSlug(fields.name),
        type: "API Endpoint",
        hostname: fields.hostname || "",
        image: fileId,  // Reference to the uploaded file
        nodes: [],
        edges: [],
        enabled: true,
      };
  
      const integration = new IntegrationBuilder(integration_data);
      const savedData = await integration.save();
      reply.send({ slug: savedData.slug });
  
    } catch (error) {
      console.error("Error processing integration:", error);
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
        const tData = {
          name: `[${item.name}][/builder/integration/${item.slug}]`,
          type: item.type,
          slug: item.slug,
          enabled: item.enabled,
        }

        if (item?.image) tData["image"] = item.image
        return tData;
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

  fastify.get("/manage/builder/integration/file/:id", async (request, reply) => {
    try {
      const fileId = request.params.id;
      const rId = new mongoose.Types.ObjectId(fileId);

      // Fetch the file metadata from fs.files collection using Mongoose
      const file = await GridFsFile.findOne({ _id: rId }).lean()

      if (!file) {
        console.error("File not found");
        return reply.status(404).send({ message: "File not found" });
      }


      // Fetch the file chunks from fs.chunks and assemble the file manually
      const chunks = await mongoose.connection.db
        .collection('fs.chunks')
        .find({ files_id: rId })
        .sort({ n: 1 })
        .toArray();


      if (!chunks || chunks.length === 0) {
        throw new Error("No chunks found for this file");
      }

      // Combine the chunks to reconstruct the file
      const fileBuffer = Buffer.concat(chunks.map(chunk => chunk.data.buffer));

      // Ensure 'contentType' is a valid string and 'length' is a valid number
      const contentType = file.contentType || 'application/octet-stream'; // Fallback to 'application/octet-stream'
      const length = file.length || 0;

      // Set headers for Content-Type and Content-Length
      reply.header('Content-Type', contentType);
      reply.header('Content-Length', length);
      reply.header('Authorization', "gnfgjnfjgn");

      // Log file details and headers to confirm correctness
      console.log("File details:", file);
      console.log("Response headers after setting:", reply.getHeaders());


      return reply.send(fileBuffer);

    } catch (error) {
      console.error("Error retrieving file:", error);
      return reply.status(500).send({ message: "File not found or an error occurred" });
    }
  });





}

module.exports = fastifyPlugin(routes);