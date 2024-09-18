/**
 * @module ManageEvents
 * @description API endpoints for managing Sera events and event playbooks.
 */

import fastifyPlugin from 'fastify-plugin';;

const { default: event_builder_model } = await import("../models/models.event_builder.cjs");
const { default: sera_events_model } = await import("../models/models.sera_events.cjs");


async function routes(fastify, options) {
  /**
   * @name GET /manage/events
   * @description Fetch events data, with optional filtering by event ID.
   * @param {string} [id=query] - Optional ID to fetch a specific event.
   * @return {transformedData} **array** - Transformed list of events with filtered or formatted fields.
   * @example
   * GET /manage/events?id=12345
   */
  fastify.get("/manage/events", async (request, reply) => {
    try {
      let query = {};
      if (request.query.id) query._id = request.query.id;
      const node_data = await sera_events_model.find(query);
      const transformedData = node_data.map((item) => {
        let maleableItem = { ...item._doc };
        delete maleableItem.__v;
        if (!request.query.id) {
          delete maleableItem._id;
          delete maleableItem.id;
          delete maleableItem.data;
          maleableItem.eventId = `[${maleableItem.eventId}](/events/viewer/${item._id})`;
        }
        maleableItem.ts = new Date(item.ts).toISOString();
        return maleableItem;
      });

      reply.send(
        normalizeEventInventory(transformedData)
          .sort((a, b) => a.eventId - b.eventId)
          .reverse()
      );
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name POST /manage/events
   * @description Create a new event with event name and data.
   * @param {string} [event_name=body] - Name of the event to create.
   * @param {object} [data=body] - Event data to be stored.
   * @return {message} **string** - Confirmation message after event creation.
   * @example
   * POST /manage/events
   */
  fastify.post("/manage/events", async (request, reply) => {
    try {
      let node_data = request.body;

      sera_events_model.create({ event: "builder", type: node_data.event_name, data: node_data.data });

      reply.send("ok");
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name GET /manage/events/playbook
   * @description Fetch all playbook events.
   * @return {transformedData} **array** - List of playbook events with names and types.
   * @example
   * GET /manage/events/playbook
   */
  fastify.get("/manage/events/playbook", async (request, reply) => {
    try {
      const node_data = await event_builder_model.find();

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
  return eventInventory.map((event) => {
    // Create a new object with sorted keys
    const sortedKeys = Object.keys(event).sort();
    const sortedEvent = {};
    sortedKeys.forEach((key) => {
      sortedEvent[key] = event[key];
    });
    return sortedEvent;
  });
}

export default fastifyPlugin(routes);;
