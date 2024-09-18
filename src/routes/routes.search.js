/**
 * @module ManageSearch
 * @description API endpoint for searching through hosts and endpoints.
 */

import fastifyPlugin from 'fastify-plugin';

const { default: endpoints_model } = await import("../models/models.endpoints.cjs");
const { default: hosts_model } = await import("../models/models.hosts.cjs");
const { default: oas_model } = await import("../models/models.oas.cjs");

import { createHostHandler } from './routes.host.js';

async function aiSearchHandler(request, reply) {
  const debugAi = request.body?.debug || false

  if (request.body.searchTerm) {
    try {
      const response = await fetch(
        process.env.SERA_AI_URL,
        {
          headers: {
            "Accept": "application/json",
            "Authorization": `Bearer ${process.env.SERA_AI_HF_API}`,
            "Content-Type": "application/json"
          },
          method: "POST",
          body: JSON.stringify({
            model: "tgi",
            messages: [{ role: "user", content: request.body.searchTerm }],
            max_tokens: 64,
            top_k: 1
          }),
        }
      );
      const result = await response.json();

      if (debugAi) {
        reply.send({ result: result?.choices?.[0]?.message?.content ? "success" : "failure", data: result?.choices?.[0]?.message?.content });
        return
      }
      const aiSequence = result?.choices[0]?.message?.content

      if (aiSequence) {
        const aiSequenceArray = JSON.parse(aiSequence)
        let oas_id
        aiSequenceArray.forEach(async element => {
          switch (element.name) {
            case "add_host":
              console.log(element?.parameters?.hostname)
              if (element?.parameters?.hostname) {
                const requestData = {
                  hostname: element.parameters.hostname
                };
                oas_id = await createHostHandler({ body: requestData });
                console.log(oas_id)
              }
              break
            case "add_endpoint":
              console.log("adding endpoint")
              let oasDoc = await oas_id ? oas_model.findById(oas_id) : oas_model.findOne({
                'servers.url': element?.parameters?.hostname
              });

              if (!oasDoc) {
                console.error(`No OAS document found for hostname: ${element?.parameters?.hostname}`);
                return null;
              }

              if (!oasDoc.paths?.[element?.parameters?.path]) {
                if (!oasDoc.paths) {
                  oasDoc.paths = {}
                }
                oasDoc.paths[element?.parameters?.path] = {};
              }

              if (!oasDoc.paths?.[element?.parameters?.path]?.[element?.parameters?.method]) {
                // Method does not exist for this path, create it with default empty structure
                oasDoc.paths[element?.parameters?.path][element?.parameters?.method || "get"] = {
                  summary: `Auto-generated path for ${element?.parameters?.path}`,
                  description: `Automatically generated operation for method ${element?.parameters?.method.toUpperCase()}`,
                  parameters: [],
                  responses: {
                    "200": {
                      description: `Example response for ${element?.parameters?.path}`,
                      headers: {},
                      content: {}
                    }
                  }
                };
              }
              console.log(oasDoc)
              console.log("THIS OASID: " + oas_id)
              if (oas_id) {
                await oas_model.findByIdAndUpdate(
                  oas_id,
                  { $set: { paths: oasDoc.paths } }, // Use $set to update or add the path/method
                  { new: false, upsert: false } // Return the updated document and create if not exists
                );
              } else {
                await oas_model.findOneAndUpdate(
                  { 'servers.url': element?.parameters?.hostname },
                  { $set: { paths: oasDoc.paths } },
                  { new: false, upsert: false } // Return the updated document and create if not exists
                );
              }

              console.log(`Path '${element?.parameters?.path}' with method '${element?.parameters?.method}' updated/created in OAS document for hostname '${element?.parameters?.hostname}'`);
              break
          }
        });

        reply.send({ result: "success", type: "host", data: { hostname: aiSequenceArray[0].parameters.hostname } });


      } else {
        reply.status(500).send("something went wrong");
      }

    } catch (error) {
      console.error(error);
    }
  }
};

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
          hosts_model.find(hostSearchQuery).exec(),
          endpoints_model.find(endpointSearchQuery)
            .populate(["host_id"]).exec()
        ]);
        const results = hosts.concat(endpoints);
        reply.send(results);

      } catch (error) {
        console.error(error);
      }
    }
  });

  fastify.post("/manage/search/ai", aiSearchHandler)
}

export default fastifyPlugin(routes);;
