const fastifyPlugin = require('fastify-plugin');

const EventBuilder = require("../models/models.eventBuilder");
const seraEvents = require("../models/models.seraEvents");

/**
 * Registers routes for managing events with the Fastify server.
 *
 * This function sets up endpoints to create, retrieve, and list events, including playbooks. The available routes are:
 * - GET `/manage/events`: Retrieves a list of events or a specific event by ID.
 * - POST `/manage/events`: Creates a new event with the provided data.
 * - GET `/manage/events/playbook`: Retrieves a list of event playbooks.
 *
 * @async
 * @function EventRoutes
 * @param {FastifyInstance} fastify - The Fastify instance to register the routes on.
 * @param {Object} options - The options object for route configuration.
 *
 * @route GET /manage/events
 * @description Retrieves a list of events or a specific event based on the provided query parameters. If no `id` is provided, sensitive data is removed from the result.
 * @param {Object} request.query - The query parameters for retrieving events.
 * @param {string} [request.query.id] - The ID of the specific event to retrieve.
 * @returns {Array<Object>} A list of events, each containing its transformed fields.
 * @throws {Error} If an error occurs while retrieving the events.
 *
 * @route POST /manage/events
 * @description Creates a new event based on the provided event name and data.
 * @param {Object} request.body - The request body containing event details.
 * @param {string} request.body.event_name - The name of the event.
 * @param {Object} request.body.data - The data associated with the event.
 * @returns {string} A confirmation message indicating the event has been created.
 * @throws {Error} If an error occurs while creating the event.
 *
 * @route GET /manage/events/playbook
 * @description Retrieves a list of available event playbooks, each with its name, type, and enabled status.
 * @returns {Array<Object>} A list of playbooks with links to their respective details.
 * @throws {Error} If an error occurs while retrieving the playbooks.
 */

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
