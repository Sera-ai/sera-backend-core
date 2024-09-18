import SwaggerParser from "@apidevtools/swagger-parser";
import mongoose from "mongoose";


const { default: event_builder_model } = await import("../models/models.event_builder.cjs");
const { default: oas_model } = await import("../models/models.oas.cjs");
const { default: endpoint_builder_model } = await import("../models/models.endpoint_builder.cjs");
const { default: integration_builder_model } = await import("../models/models.integration_builder.cjs");
const { default: builder_node_model } = await import("../models/models.builder_node.cjs");
const { default: builder_edge_model } = await import("../models/models.builder_edge.cjs");


import {
    getRequestParameters,
    getResponseParameters,
} from "./helpers.oas.js";



function getDataFromPath(arr, obj) {
    let currentObj = obj;

    for (let i = 0; i < arr.length; i++) {
        const key = arr[i];
        if (key in currentObj) {
            currentObj = currentObj[key];
        } else {
            return null; // key not found in object
        }
    }

    return currentObj; // Return the data from the last key in the array
}



export function generateRandomString(length = 12) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}

export async function getFields({ request, hostname, oas_id }) {
    try {

        const path = request.body.path == "" ? "/" : request.body.path
        const method = request.body.method
        const oas = await oas_model.findById(oas_id);
        const oasPathways = [path, method.toLowerCase()];
        const pathwayData = getDataFromPath(oasPathways, oas.paths);

        if (pathwayData) {
            const api = await SwaggerParser.parse(oas);

            let endpoint = api.paths[path][method.toLocaleLowerCase()];
            const response = getResponseParameters(endpoint, oas);
            const parameters = getRequestParameters(endpoint, oas);
            return [parameters, method, response];
        } else {
            return [null, method];
        }
    } catch (e) {
        console.log(e);
    }
}

export const getColor = (type) => {
    switch (type) {
        case "integer":
            return "#a456e5";
        case "number":
            return "#a456e5";
        case "string":
            return "#2bb74a";
        case "array":
            return "#f1ee07";
        case "boolean":
            return "#FF4747";
    }
};

export function stringToSlug(str) {
    return str
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with a single hyphen
        .trim(); // Trim leading/trailing spaces and hyphens
}

export async function getBuilder(builderId, parameters, response, builderType = 0) {
    let inventoryRes

    switch (builderType) {
        case 0: inventoryRes = await endpoint_builder_model.findById(builderId); break;
        case 1: inventoryRes = await event_builder_model.findOne({ slug: builderId }); break;
        case 2: inventoryRes = await integration_builder_model.findOne({ slug: builderId }); break;
    }

    if (!inventoryRes) {
        console.log("Builder inventory not found");
        return;
    }

    const nodeIds = inventoryRes.nodes.map(
        (node) => new mongoose.Types.ObjectId(node._id)
    );
    const edgeIds = inventoryRes.edges.map(
        (edge) => new mongoose.Types.ObjectId(edge._id)
    );

    const nodes = await builder_node_model.find({
        _id: { $in: nodeIds },
    });

    nodes.forEach((node) => {
        if (node?.data?.headerType) {
            if (node.data.headerType == 1) {
                node.data.out = parameters;
            } else if (node.data.headerType == 2) {
                node.data.in = parameters;
            } else if (node.data.headerType == 3) {
                node.data.out = response;
            } else if (node.data.headerType == 4) {
                let copyResponse = JSON.parse(JSON.stringify(response));
                delete copyResponse["Status Codes"];
                node.data.in = copyResponse;
            }
        }
    });

    const edges = (
        await builder_edge_model.find({
            _id: { $in: edgeIds },
        }).lean()
    ).map((edge) => ({
        ...edge,
        id: edge._id.toString(),
    }));

    return { nodes, edges };
}

