const SwaggerParser = require("@apidevtools/swagger-parser");
const mongoose = require("mongoose");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const IntegrationBuilder = require("../models/models.integrations");
const OAS = require("../models/models.oas");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");

const {
    getRequestParameters,
    getResponseParameters,
} = require("./helpers.oas");



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


// Custom reply object that captures the send result
function createCustomReply() {
    return {
        status: function (code) {
            this.statusCode = code;
            return this; // For chaining status and send
        },
        send: function (payload) {
            // Return the payload that would have been sent
            return payload;
        }
    };
}


function generateRandomString(length = 12) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}

async function getFields({ request, hostname, oas_id }) {
    try {

        const path = request.body.path == "" ? "/" : request.body.path
        const method = request.body.method
        const oas = await OAS.findById(oas_id);
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

const getColor = (type) => {
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

function stringToSlug(str) {
    return str
        .toLowerCase() // Convert to lowercase
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with a single hyphen
        .trim(); // Trim leading/trailing spaces and hyphens
}

async function getBuilder(builderId, parameters, response, builderType = 0) {
    let inventoryRes

    switch (builderType) {
        case 0: inventoryRes = await Builder.findById(builderId); break;
        case 1: inventoryRes = await EventBuilder.findOne({ slug: builderId }); break;
        case 2: inventoryRes = await IntegrationBuilder.findOne({ slug: builderId }); break;
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

    const nodes = await Nodes.find({
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
        await Edges.find({
            _id: { $in: edgeIds },
        }).lean()
    ).map((edge) => ({
        ...edge,
        id: edge._id.toString(),
    }));

    return { nodes, edges };
}

module.exports = {
    stringToSlug,
    getBuilder,
    getColor,
    getFields,
    generateRandomString,
    getDataFromPath,
}