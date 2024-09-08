/**
 * @module ManageSearch
 * @description API endpoint for searching through hosts and endpoints.
 */

const fastifyPlugin = require('fastify-plugin');

const Hosts = require("../models/models.hosts");
const Endpoints = require("../models/models.endpoints");

async function routes(fastify, options) {
  /**
   * @name POST /manage/search
   * @description Search through hosts and endpoints based on a search term.
   * @param {string} searchTerm - The search term to query hosts and endpoints.
   * @return {results} **array** - List of matching hosts and endpoints.
   * @example
   * POST /manage/search
   * {
   *   "searchTerm": "example"
   * }
   */
  fastify.post("/manage/search", async (request, reply) => {

    if (request.body.searchTerm) {
      // Define the fields you want to search in each collection
      let hostFields = ['hostname'];
      let endpointFields = ['endpoint', 'method'];

      // Create the search conditions for each collection
      let hostSearchConditions = hostFields.map(field => ({ [field]: new RegExp(request.body.searchTerm, 'i') }));
      let endpointSearchConditions = endpointFields.map(field => ({ [field]: new RegExp(request.body.searchTerm, 'i') }));

      // Create the search queries for each collection
      let hostSearchQuery = { $or: hostSearchConditions };
      let endpointSearchQuery = { $or: endpointSearchConditions };

      try {
        const [hosts, endpoints] = await Promise.all([
          Hosts.find(hostSearchQuery).exec(),
          Endpoints.find(endpointSearchQuery)
            .populate(["host_id"]).exec()
        ]);
        const results = hosts.concat(endpoints);
        reply.send(results);

      } catch (error) {
        console.error(error);
      }
    }
  });
}

module.exports = fastifyPlugin(routes);
