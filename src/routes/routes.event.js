const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");

async function routes(fastify, options) {
  fastify.get("/", async (request, reply) => {
    try {
      const node_data = await EventBuilder.find();

      const transformedData = node_data.map((item) => {
        return {
          name: `[${item.name}][/events/playbook/${item.slug}]`,
          type: item.type,
          enabled: item.enabled,
        };
      });

      reply.send(transformedData);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });
}

module.exports = fastifyPlugin(routes);
