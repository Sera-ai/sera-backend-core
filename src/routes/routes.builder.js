/**
 * @module ManageBuilders
 * @description API endpoints for managing builder events and nodes.
 */

import fastifyPlugin from 'fastify-plugin';
import mongoose from "mongoose";
import axios from "axios";
import SwaggerParser from "@apidevtools/swagger-parser";


const { default: event_builder_model } = await import("../models/models.event_builder.cjs");
const { default: event_struc_model } = await import("../models/models.event_struc.cjs");
const { default: endpoints_model } = await import("../models/models.oas.cjs");
const { default: endpoint_builder_model } = await import("../models/models.endpoint_builder.cjs");
const { default: builder_template_model } = await import("../models/models.builder_template.cjs");
const { default: integration_builder_model } = await import("../models/models.integration_builder.cjs");
const { default: builder_node_model } = await import("../models/models.builder_node.cjs");
const { default: builder_edge_model } = await import("../models/models.builder_edge.cjs");


import {
  getRequestParameters,
  getResponseParameters,
} from "../helpers/helpers.oas.js";

import { getBuilder, getColor, getFields, generateRandomString } from "../helpers/helpers.general.js";

async function routes(fastify, options) {

  /**
   * @name GET /manage/builders
   * @description Fetch builder events and associated data.
   * @param {string} [id=query] - Optional ID to fetch specific builder event data.
   * @return {node_data} **object** - Data of the builder events.
   * @example
   * GET /manage/builders?id=12345
   */
  fastify.get("/manage/builders", async (request, reply) => {
    try {
      let node_data;
      if (request.query.id) {
        node_data = await endpoints_model.find({ _id: request.query.id }).populate([
          "host_id",
          "builder_id",
        ]);
      } else {
        node_data = await endpoints_model.find()
          .populate(["host_id", "builder_id"])
          .limit(100);
      }
      reply.send(node_data);
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name POST /manage/builder
   * @description Add new builder event data.
   * @param {string} [hostname=body] - Hostname to associate the builder event.
   * @param {string} [host_id=body] - Host ID related to the builder event.
   * @param {string} [endpoint=body] - Endpoint for the builder event.
   * @param {string} [method=body] - HTTP method for the builder event.
   * @return {dataToSave} **object** - Saved builder event data.
   * @example
   * POST /manage/builder
   */
  fastify.post("/manage/builder", async (request, reply) => {
    try {
      const data1 = awaithosts_model.findById(request.body.host_id);
      const truepath = (request.body.hostname + request.body.endpoint).replace(
        data1.hostname,
        ""
      );

      let host_id = data1._id;

      const data = new endpoints_model({
        host_id: host_id,
        builder_id: request.body.builder_id ?? null,
        endpoint: truepath,
        method: request.body.method
      });

      try {
        const dataToSave = await data.save();
        reply.status(200).send(dataToSave);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name GET /manage/builder
   * @description Fetch detailed builder data based on path and method.
   * @param {string} [path=query] - Path for the builder event.
   * @param {string} [method=query] - HTTP method to filter.
   * @return {builder} **object** - Detailed builder data including nodes and edges.
   * @example
   * GET /manage/builder?path=/api/test&method=GET
   */
  fastify.get("/manage/builder", async (request, reply) => {
    let endpoint;
    let parameters = {};
    let response = {};
    let responseCodes = [];
    let mongoEndpoint = null;
    let oas = null;
    let host = null;

    try {
      if (request.query.path) {
        const queryPath = request.query.path.split("/");
        if (queryPath[0] == "") queryPath.shift();

        host = queryPath[0];
        queryPath.shift();

        const method = (queryPath[queryPath.length - 1]).toUpperCase();
        queryPath.pop();

        const path = queryPath.join("/");

        const url = "http://" + host + "/" + path;
        const parsed = new URL(url);
        const oasUrl = `${parsed.protocol}//${parsed.host}`;

        const substringToMatch = parsed.host.split(":")[0];

        const matchingOas = awaitoas_model.find({
          "servers.url": { $regex: substringToMatch },
        });

        const matchingHosts = awaithosts_model.find({
          hostname: { $regex: substringToMatch },
        });

        const normalizedUrl = url.replace(/^https?:\/\//, "").split("?")[0];

        let bestMatch = null;
        let bestMatchLength = 0;
        let bestMatchLength2 = 0;

        matchingOas.forEach((searchedOas) => {
          searchedOas.servers.forEach((server) => {
            const serverUrlNormalized = server.url.replace(/^https?:\/\//, "");

            if (normalizedUrl.startsWith(serverUrlNormalized)) {
              const matchLength = serverUrlNormalized.length;
              if (matchLength > bestMatchLength2) {
                oas = searchedOas;
                bestMatchLength2 = matchLength;
              }
            }
          });
        });

        matchingHosts.forEach((host) => {
          if (normalizedUrl.startsWith(host.hostname)) {
            const matchLength = host.hostname.length;
            if (matchLength > bestMatchLength) {
              bestMatch = host;
              bestMatchLength = matchLength;
            }
          }
        });

        host = bestMatch;
        if (!host) throw { error: "NoHost" };

        const truepath = `/${path}`;

        mongoEndpoint = await endpoints_model.findOne({
          host_id: host._id,
          endpoint: (truepath.charAt(0) == "/" ? "" : "/") + truepath,
          method: method,
        });
        if (!mongoEndpoint) throw { error: "NoEndpoint", host: host._id };

        const { ...parseableOas } = oas;

        try {
          const api = await SwaggerParser.parse(oas);

          endpoint = api.paths[truepath][method.toLocaleLowerCase()];

          parameters = getRequestParameters(endpoint, api);
          response = getResponseParameters(endpoint, api);

          responseCodes = Object.keys(
            api.paths[truepath][method.toLocaleLowerCase()].responses
          );
        } catch (error) {
          console.error("Error parsingoas_model document:", error);
        }
      }

      const builderId = request.query.event || mongoEndpoint?._doc.builder_id;

      const builderData = await getBuilder(
        builderId,
        parameters,
        response,
        request.query.event ? true : false
      );
      if (!builderData) throw { error: "NoBuilder", host: host._id };
      const { nodes, edges } = builderData;

      reply.status(200).send({
        issue: false,
        oas: oas,
        builderId: builderId,
        builder: { nodes, edges },
      });
    } catch (error) {
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
   * @name POST /manage/builder/create
   * @description Create a new builder event with nodes and edges based on the provided template and fields.
   * @param {string} [host_id=body] - ID of the host for which the builder is being created.
   * @param {string} [hostname=body] - Hostname of the builder.
   * @param {string} [path=body] - Path for the builder.
   * @param {string} [method=body] - HTTP method for the builder.
   * @return {dataToSave} **object** - The newly created builder event with nodes and edges.
   * @example
   * POST /manage/builder/create
   */
  fastify.post("/manage/builder/create", async (request, reply) => {
    try {
      const host = awaithosts_model.findById(request.body.host_id);
      const parameters = await getFields({
        request,
        hostname: host.hostname,
        oas_id: host.oas_spec,
      });

      console.log(parameters)

      const fields = parameters[0];
      const resFields = parameters[2];
      const template = await builder_template_model.findOne({ template: true });

      const truepath = (request.body.hostname + request.body.path).replace(
        host.hostname,
        ""
      );

      let editTemplate = JSON.stringify(template);

      const gen1 = generateRandomString();
      const gen2 = generateRandomString();
      const gen3 = generateRandomString();
      const gen4 = generateRandomString();

      editTemplate = editTemplate.replace(/{{host}}/g, host.hostname);
      editTemplate = editTemplate.replace(/{{method}}/g, request.body.method);
      editTemplate = editTemplate.replace(/{{path}}/g, truepath);

      editTemplate = editTemplate.replace(/{{gen-1}}/g, gen1);
      editTemplate = editTemplate.replace(/{{gen-2}}/g, gen2);
      editTemplate = editTemplate.replace(/{{gen-3}}/g, gen3);
      editTemplate = editTemplate.replace(/{{gen-4}}/g, gen4);
      editTemplate = editTemplate.replace(/{{gen-5}}/g, generateRandomString());
      editTemplate = editTemplate.replace(/{{gen-6}}/g, generateRandomString());

      let finalizedTemplate = JSON.parse(editTemplate);

      Object.keys(fields).forEach((field) => {
        fields[field].forEach((f) => {
          const databayoo = {
            source: gen1,
            sourceHandle: `${field}.${f.name}`,
            target: gen2,
            targetHandle: `${field}.${f.name}`,
            id: `${gen1}-${gen2}-${f.name}-${generateRandomString()}`,
            animated: false,
            style: {
              stroke: getColor(f.schema["type"]),
            },
          };

          finalizedTemplate.edges.push(databayoo);
        });
      });

      Object.keys(resFields).forEach((field) => {
        resFields[field].forEach((f) => {
          const databayoo2 = {
            source: gen3,
            sourceHandle: `${field}.${f.name}`,
            target: gen4,
            targetHandle:
              f.schema["type"] == "null" ? `sera.sera_start` : `${field}.${f.name}`,
            id: `${gen3}-${gen4}-${f.name}-${generateRandomString()}`,
            animated: f.schema["type"] == "null" ? true : false,
            style: {
              stroke: getColor(f.schema["type"]),
            },
          };

          finalizedTemplate.edges.push(databayoo2);
        });
      });

      let nodes;
      let edges;

      try {
        const nodeSavePromises = finalizedTemplate.nodes.map((node) =>
          new builder_node_model(node).save()
        );
        const savedNodes = await Promise.all(nodeSavePromises);
        nodes = savedNodes.map((savedNode) => savedNode._id);

        const edgeSavePromises = finalizedTemplate.edges.map((edge) =>
          new builder_edge_model(edge).save()
        );
        const savedEdges = await Promise.all(edgeSavePromises);
        edges = savedEdges.map((savedEdge) => savedEdge._id);
      } catch (error) {
        console.error("Error saving nodes or edges:", error);
      }

      const data = new endpoint_builder_model({
        edges,
        nodes,
        enabled: true,
      });

      try {
        const dataToSave = await data.save();
        reply.status(200).send(dataToSave);
      } catch (error) {
        console.log("e1", error)
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      console.log("e2", error)

      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name POST /manage/builder/update
   * @description Update an existing builder event.
   * @param {string} [hostname=body] - Hostname of the builder event.
   * @param {string} [endpoint=body] - Endpoint to update.
   * @param {string} [method=body] - HTTP method of the event.
   * @param {string} [builder_id=body] - Builder ID for the event.
   * @return {dataToSave} **object** - Updated builder event data.
   * @example
   * POST /manage/builder/update
   */
  fastify.post("/manage/builder/update", async (request, reply) => {
    try {
      const data1 = awaithosts_model.find({ forwards: request.body.hostname });
      let host_id = data1[0]._id;
      const endpoint = await endpoints_model.find({
        host_id: host_id,
        endpoint: request.body.endpoint,
        method: request.body.method,
      });

      try {
        const dataToSave = await endpoint[0].updateOne({
          builder_id: request.body.builder_id,
        });
        reply.status(200).send(dataToSave);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  /**
   * @name POST /manage/builder/node
   * @description Add a new node to the builder event.
   * @param {string} [x-sera-builder=header] - Builder ID for the event.
   * @param {object} [body=body] - Node details to be added.
   * @return {savedData} **object** - Saved node data.
   * @example
   * POST /manage/builder/node
   */
  fastify.post("/manage/builder/node", async (request, reply) => {

    const builderId = request.headers["x-sera-builder"];
    if (builderId) {
      try {
        let nodeDataToBeSaved = request.body;

        if (nodeDataToBeSaved.type == "sendEventNode") {
          const struct = new event_struc_model({
            event: "builder-default",
            type: "new Event",
            description: "new event",
            data: {},
          });
          const sendEventNodeId = await struct.save();
          nodeDataToBeSaved.data.struc_id = sendEventNodeId._id;
        }

        const nodedata = new builder_node_model(nodeDataToBeSaved);
        const savedData = await nodedata.save();

        if (request.query.type == "builder") {
          endpoint_builder_model.findByIdAndUpdate(builderId, {
            $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
          }).then((e) => {
            socket.wsEmit("nodeCreated", {
              node: savedData,
              builder: builderId,
            });
          });
        } else {
          let BuilderModel;
          switch (request.query.type) {
            case "event": BuilderModel = event_builder_model; break;
            case "integration": BuilderModel = integration_builder_model; break;
          }

          BuilderModel.findOneAndUpdate(
            { slug: builderId },
            {
              $push: { nodes: new mongoose.Types.ObjectId(savedData._id) },
            }
          ).then(async (e) => {

            if (request.query.type == "integration" && JSON.stringify(savedData).includes("replace-host-string")) {
              let newSavedData = JSON.parse(JSON.stringify(savedData).replace("replace-host-string", e.hostname));

              savedData.overwrite(newSavedData);
              const overwrittenSave = await savedData.save(); // Save the modified data to the database

              socket.wsEmit("nodeCreated", {
                node: overwrittenSave,
                builder: builderId,
              });
            } else {
              socket.wsEmit("nodeCreated", {
                node: savedData,
                builder: builderId,
              });
            }

          });
        }
        reply.status(200).send(savedData);
      } catch (error) {
        reply.status(500).send({ message: error.message });
      }
    }
  });
}

export default fastifyPlugin(routes);;
