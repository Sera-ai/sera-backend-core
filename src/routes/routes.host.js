/**
 * @module ManageHosts
 * @description API endpoints for managing hosts, OpenAPI Specifications (OAS), and DNS configurations.
 */

import fastifyPlugin from 'fastify-plugin';


const { default: dns_model } = await import("../models/models.hosts.cjs");
const { default: hosts_model } = await import("../models/models.hosts.cjs");
const { default: oas_model } = await import("../models/models.oas.cjs");



import Converter from "api-spec-converter";
import yaml from "js-yaml";

import { generateRandomString } from "../helpers/helpers.general.js";


export async function createHostHandler(request, reply) {
  let oas;
  let oasJsonFinal = {};
  try {
    function getSecondToLastElement(hostname) {
      const parts = hostname.split(".");
      return parts.length >= 2 ? parts[parts.length - 2] : null;
    }

    function cleanUrl(url) {
      const pattern = /^(https?:\/\/)?(www\.)?/;
      return url.replace(pattern, "");
    }

    function detectOASVersion(oas) {
      if (oas.openapi) {
        const majorVersion = parseInt(oas.openapi.charAt(0));
        return majorVersion === 3 ? "openapi_3" : "unknown";
      } else if (oas.swagger) {
        const majorVersion = parseInt(oas.swagger.charAt(0));
        return majorVersion === 2 ? "swagger_2" : "swagger_1";
      }
      return "unknown";
    }

    function isJsonString(str) {
      try {
        JSON.parse(str);
        return true;
      } catch (e) {
        return false;
      }
    }

    let hostdomain;
    if (!request.body?.oas) {
      oas = new oas_model({
        openapi: "3.0.1",
        info: {
          title: "Minimal API",
          version: "1.0.0",
        },
        servers: [{ url: request.body.hostname }],
        paths: {},
      });

      oasJsonFinal = {
        openapi: "3.0.1",
        info: {
          title: "Minimal API",
          version: "1.0.0",
        },
        servers: [{ url: request.body.hostname }],
        paths: {},
      };

      hostdomain = getSecondToLastElement(request.body.hostname);
    } else {
      let oasData = request.body.oas;
      if (typeof oasData === "string" && !isJsonString(oasData)) {
        try {
          oasData = yaml.load(oasData);
        } catch (e) {
          return reply
            .status(400)
            .send("Invalid OAS format: Please provide valid JSON or YAML.");
        }
      }

      const oasJson = oasData;
      const oasversion = detectOASVersion(oasJson);
      if (oasversion == "unknown") throw { error: "unknown oas", oas: oasJson };
      if (oasversion != "openapi_3") {
        Converter.convert(
          {
            from: oasversion,
            to: "openapi_3",
            source: oasJson,
          },
          function (err, converted) {
            oas = new oas_model(converted);
            hostdomain = getSecondToLastElement(converted.servers[0].url);
            oasJsonFinal = converted;
          }
        );
      } else {
        oas = new oas_model(oasJson);
        oasJsonFinal = oasJson;
        hostdomain = getSecondToLastElement(oasJson.servers[0].url);
      }
    }

    const oasSave = await oas_model.save();
    const subdo = `${hostdomain.substring(0, 40)}-${generateRandomString(6)}`;
    const dns = new dns_model({
      sera_config: {
        domain: cleanUrl(hostdomain),
        expires: null,
        sub_domain: cleanUrl(subdo),
        obfuscated: null,
      },
    });

    const dnsSave = await dns_model.save();

    const data = new hosts_model({
      oas_spec: oasSave._id,
      sera_dns: dnsSave._id,
      frwd_config: {
        host: cleanUrl(hostdomain),
        port: request.body.port || 80,
      },
      sera_config: {
        strict: false,
        learn: true,
        https: true,
      },
      hostname: cleanUrl(oasJsonFinal.servers[0].url),
    });

    try {
      const dataToSave = await data.save();
      reply.status(200).send(dataToSave);
      return oasSave._id
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  } catch (e) {
    console.warn(e);
  }
}

async function routes(fastify, options) {

  /**
   * @name POST /manage/host
   * @description Create a new host entry, including OAS and DNS configurations.
   * @param {string} [hostname=body] - Hostname for the new host.
   * @param {number} [port=body] - Optional port for the new host (default is 80).
   * @param {object} [oas=body] - Optional OAS (OpenAPI Specification) data for the host.
   * @return {dataToSave} **object** - Saved host data with OAS and DNS configurations.
   * @example
   * POST /manage/host
   */
  fastify.post("/manage/host", createHostHandler);

  /**
   * @name GET /manage/host
   * @description Fetch host data with optional filtering by host ID.
   * @param {string} [id=query] - Optional host ID to fetch specific host data.
   * @return {node_data} **object** - Host data with OAS specification.
   * @example
   * GET /manage/host?id=12345
   */
  fastify.get("/manage/host", async (request, reply) => {
    try {
      let node_data;
      if (request.query.id) {
        node_data = await hosts_model.find({ _id: request.query.id }).populate([
          "oas_spec",
        ]);
      } else {
        node_data = await hosts_model.find().populate(["oas_spec"]).limit(100);
      }
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name PATCH /manage/host
   * @description Update the configuration of a host by host ID.
   * @param {string} [host_id=body] - Host ID to update.
   * @param {string} [field=body] - Field to update within `sera_config`.
   * @param {string} [key=body] - New value for the specified field.
   * @return {updatedHost} **object** - Updated host data.
   * @example
   * PATCH /manage/host
   */
  fastify.patch("/manage/host", async (request, reply) => {
    try {
      if (!request.body.host_id) {
        return reply
          .status(400)
          .json({ message: "Missing data for update or host ID." });
      }

      let field = request.body.field;
      let updateObject = { $set: {} };
      updateObject.$set[`sera_config.${field}`] = request.body.key;

      const updatedHost = await hosts_model.findByIdAndUpdate(
        request.body.host_id,
        updateObject,
        { new: true }
      );

      if (!updatedHost) {
        return reply.status(404).send({ message: "Host not found." });
      }

      reply.send(updatedHost);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name GET /manage/host/oas
   * @description Fetch OAS data for a specific host or all hosts.
   * @param {string} [host=query] - Optional hostname to fetch specific OAS data.
   * @return {oas_data} **object** - OAS specification data.
   * @example
   * GET /manage/host/oas?host=myhost.com
   */
  fastify.get("/manage/host/oas", async (request, reply) => {
    try {
      if (request.query.host) {
        let host_data = await hosts_model.findOne({ hostname: request.query.host });
        let oas_data = await oas_model.findOne({ _id: host_data.oas_spec });
        reply.send(oas_data);
      } else {
        let oas_data = await oas_model.find();
        reply.send(oas_data);
      }
    } catch (error) {
      console.log(error)
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name GET /manage/host/dns
   * @description Fetch DNS configuration data for a specific host.
   * @param {string} [host=query] - Hostname to fetch DNS configuration.
   * @return {dns_data} **object** - DNS configuration data.
   * @example
   * GET /manage/host/dns?host=myhost.com
   */
  fastify.get("/manage/host/dns", async (request, reply) => {
    try {
      if (request.query.host) {
        host_data = await hosts_model.findOne({ hostname: request.query.host });
        dns_data = await dns_model.findOne({ _id: host_data.sera_dns });
        reply.send(dns_data);
      } else {
        reply.status(500).send({ message: "no host provided" });
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });
}

export default {
  routes: fastifyPlugin(routes),
  createHostHandler
};