const fastifyPlugin = require('fastify-plugin');

const EventBuilder = require("../models/models.eventBuilder");
const seraEvents = require("../models/models.seraEvents");

async function routes(fastify, options) {
  fastify.get("/manage/events", async (request, reply) => {
    try {
      let query = {}
      if (request.query.id) query._id = request.query.id
      const node_data = await seraEvents.find(query);
      const transformedData = node_data.map((item) => {
        let maleableItem = { ...item._doc }
        delete maleableItem.__v
        if (!request.query.id) {
          delete maleableItem._id
          delete maleableItem.id
          delete maleableItem.data
          maleableItem.eventId = `[${maleableItem.eventId}](/events/viewer/${item._id})`
        }
        maleableItem.ts = new Date(item.ts).toISOString()
        return maleableItem
      });

      console.log(transformedData)


      reply.send(normalizeEventInventory(transformedData).sort((a, b) => a.eventId - b.eventId).reverse());
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.post("/manage/events", async (request, reply) => {
    try {
      let node_data = request.body

      console.log(node_data)

      seraEvents.create({ event: "builder", type: node_data.event_name, data: node_data.data })

      reply.send("ok");
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/events/playbook", async (request, reply) => {
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

function normalizeEventInventory(eventInventory) {
  return eventInventory.map(event => {
    // Create a new object with sorted keys
    const sortedKeys = Object.keys(event).sort();
    const sortedEvent = {};
    sortedKeys.forEach(key => {
      sortedEvent[key] = event[key];
    });
    return sortedEvent;
  });
}

module.exports = fastifyPlugin(routes);
