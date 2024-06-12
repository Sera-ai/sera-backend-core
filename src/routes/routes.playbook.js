const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");

const EventBuilder = require("../models/models.eventBuilder");

async function routes(fastify, options) {
  fastify.get("/manage/playbook", async (request, reply) => {
    try {
      const node_data = await EventBuilder.find();

      const transformedData = node_data.map((item) => {
        return {
          name: `[${item.name}](/events/playbook/${item.slug})`,
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
