const express = require('express');
const Hosts = require('../models/models.hosts');
const OAS = require('../models/models.oas');
const Builder = require('../models/models.builder');
const Nodes = require('../models/models.nodes');
const Endpoints = require('../models/models.endpoints');
const Plugins = require('../models/models.plugins');
const router = express.Router();

//Post Method
router.post('/host/create', async (req, res) => {
    const data = new Hosts({
        hostname: [req.body.hostname],
        port: req.body.port
    })

    try {
        const dataToSave = await data.save();
        res.status(200).json(dataToSave)
    }
    catch (error) {
        res.status(400).json({ message: error.message })
    }
})

router.post('/node/create', async (req, res) => {
    const data = new Nodes({ fields: { in: {}, out: req.body.out }, headerType: false, function: req.body.out.__type.replace("__", ""), inputData: null, nodeType: 0 })

    try {
        const dataToSave = await data.save();
        console.log(dataToSave)
        res.status(200).json(dataToSave)
    }
    catch (error) {
        res.status(400).json({ message: error.message })
    }
})

router.post('/endpoint/create', async (req, res) => {
    console.log("data1")

    try {
        const data1 = await Hosts.find({ "forwards": req.body.hostname });
        console.log(data1)

        let host_id = (data1)[0]._id

        const data = new Endpoints({
            host_id: host_id,
            endpoint: req.body.endpoint,
            method: req.body.method,
            debug: true,
            rely: false,
            builder_id: req.body.builder_id ?? null
        })
        console.log(data)

        try {
            const dataToSave = await data.save();
            res.status(200).json(dataToSave)
        }
        catch (error) {
            res.status(400).json({ message: error.message })
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

router.post('/endpoint/update', async (req, res) => {
    try {
        const data1 = await Hosts.find({ "forwards": req.body.hostname });
        console.log(data1)
        let host_id = (data1)[0]._id
        const endpoint = await Endpoints.find({
            host_id: host_id,
            endpoint: req.body.endpoint,
            method: req.body.method
        })
        console.log(endpoint)


        try {
            const dataToSave = await endpoint[0].updateOne({ builder_id: req.body.builder_id })
            res.status(200).json(dataToSave)
        }
        catch (error) {
            res.status(400).json({ message: error.message })
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

router.post('/builder/create', async (req, res) => {
    try {
        const boop = await getFields(req)
        const fields = boop[0]
        const template = (await Builder.find({ "template": true }))[0]._doc;

        let editTemplate = JSON.stringify(template);

        const gen1 = generateRandomString()
        const gen2 = generateRandomString()
        const gen3 = generateRandomString()
        const gen4 = generateRandomString()

        editTemplate = editTemplate.replace(/{{host}}/g, req.body.hostname);
        editTemplate = editTemplate.replace(/{{method}}/g, req.body.method);
        editTemplate = editTemplate.replace(/{{path}}/g, req.body.path);

        editTemplate = editTemplate.replace(/{{gen-1}}/g, gen1);
        editTemplate = editTemplate.replace(/{{gen-2}}/g, gen2);
        editTemplate = editTemplate.replace(/{{gen-3}}/g, gen3);
        editTemplate = editTemplate.replace(/{{gen-4}}/g, gen4);
        editTemplate = editTemplate.replace(/{{gen-5}}/g, generateRandomString());
        editTemplate = editTemplate.replace(/{{gen-6}}/g, generateRandomString());




        let finalizedTemplate = JSON.parse(editTemplate)

        if (boop[1] != "GET") {
            Object.keys(fields).map((field, int) => {

                const databayoo = {
                    "source": gen1,
                    "sourceHandle": `flow-source-${gen1}-${field}`,
                    "target": gen2,
                    "targetHandle": `flow-target-${gen2}-${field}`,
                    "type": "param",
                    "id": `${gen1}-${gen2}-${field}-${generateRandomString()}`,
                    "animated": false,
                    "style": {
                        "stroke": getColor(fields[field]["type"])
                    },
                    "selected": false
                }

                const databayoo2 = {
                    "source": gen3,
                    "sourceHandle": `flow-source-${gen3}-${field}`,
                    "target": gen4,
                    "targetHandle": `flow-target-${gen4}-${field}`,
                    "type": "param",
                    "id": `${gen3}-${gen4}-${field}-${generateRandomString()}`,
                    "animated": false,
                    "style": {
                        "stroke": getColor(fields[field]["type"])
                    },
                    "selected": false
                }

                finalizedTemplate.edges.push(databayoo)
                finalizedTemplate.edges.push(databayoo2)
            })
        }

        for (const node of finalizedTemplate.nodes) {
            console.log(node.data);
            const savedNode = await new Nodes(node.data).save();
            console.log(savedNode)
            node.node_id = savedNode._id;
            delete node.data;
        }

        const data = new Builder({
            edges: finalizedTemplate.edges,
            nodes: finalizedTemplate.nodes
        })

        try {
            const dataToSave = await data.save();
            res.status(200).json(dataToSave)
        }
        catch (error) {
            res.status(400).json({ message: error.message })
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

router.post('/plugins/create', async (req, res) => {
    try {
        let ownerData
        let ep = false
        const data1 = await Hosts.findById(req.body.owner_id);
        if (!data1) {
            const searc = await Endpoints.findById(req.body.owner_id);
            ep = true
            ownerData = searc
        } else {
            ownerData = data1
        }

        const collectionSearch = ep ? Endpoints : Hosts
        const orderBase = collectionSearch.find({ "owner_id": req.body.owner_id })

        const data = new Plugins({
            owner_id: ownerData._id,
            endpoint: req.body.endpoint,
            order: (await orderBase).length + 1,
            breakable: req.body.breakable,
            method: req.body.method
        })

        try {
            const dataToSave = await data.save();
            res.status(200).json(dataToSave)
        }
        catch (error) {
            res.status(400).json({ message: error.message })
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

router.post('/plugouts/create', async (req, res) => {
    try {
        let ownerData
        let ep = false
        const data1 = await Hosts.findById(req.body.owner_id);
        if (!data1) {
            const searc = await Endpoints.findById(req.body.owner_id);
            ep = true
            ownerData = searc
        } else {
            ownerData = data1
        }

        const collectionSearch = ep ? Endpoints : Hosts
        const orderBase = collectionSearch.find({ "owner_id": req.body.owner_id })

        const data = new Plugins({
            owner_id: ownerData._id,
            endpoint: req.body.endpoint,
            order: (await orderBase).length + 1,
            breakable: req.body.breakable,
            method: req.body.method
        })

        try {
            const dataToSave = await data.save();
            res.status(200).json(dataToSave)
        }
        catch (error) {
            res.status(400).json({ message: error.message })
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})


router.get('/info', async (req, res) => {
    try {

        res.json({
            method: req.method,
            url: req.url,
            headers: req.headers,
            params: req.params,
            query: req.query,
            body: req.body,
        })
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})
router.get('/getNode', async (req, res) => {
    try {
        const node_data = await Nodes.findById(req.query.id);
        res.send(node_data)
    }
    catch (error) {
        res.status(500).json({ message: error.message })
    }
})

router.get('/getEndpoint', async (req, res) => {
    try {
        const url = "http:/" + req.query.path
        console.log(url)
        const parsed = new URL(url)
        const oasUrl = `${parsed.protocol}//${parsed.host}`


        const lastSlashIndex = parsed.pathname.lastIndexOf('/');
        const path = parsed.pathname.substring(0, lastSlashIndex);   // "boop/boop"
        const method = (parsed.pathname.substring(lastSlashIndex + 1)).toUpperCase(); // "boop"
        const oas = await OAS.findOne({ servers: { $elemMatch: { url: oasUrl } } });




        const host = (await Hosts.find({ "forwards": parsed.host.split(":")[0] }))[0];
        if (!host) throw { error: "NoHost" }

        const endpoint = (await Endpoints.find({ "host_id": host._id, endpoint: path, method: method }))[0];
        if (!endpoint) throw { error: "NoEndpoint", host: host._id }

        console.log(endpoint)

        //const oas = await OAS.findById(host._doc.oas_spec);
        const builder = await Builder.findById(endpoint._doc.builder_id)
        if (!builder) throw { error: "NoBuilder", host: host._id }

        //grab or setup nodes
        let { nodes } = fragileBuilder = builder,
            change = false,
            nodesToSend = [];

        const nodeToSave = await Promise.all(nodes.map(async (node) => {
            let nodeToSendItem = node;
            if (node.node_id && node.type == "apiNode") {
                const nodeData = await Nodes.findById(node.node_id);

                if (!Object.keys(nodeData).includes("fields")) {
                    const oasPathways = parsed.pathname.split("/").slice(1).map((path, index, arr) => (index === arr.length - 1) ? path : "/" + path);
                    const pathwayData = getDataFromPath(oasPathways, oas.paths);
                    let fields = { in: [], out: [] };

                    if (method === "POST" && pathwayData) {
                        const getRefData = (ref) => getDataFromPath(ref.split("/").slice(1), oas._doc).properties;

                        if ((nodeData.headerType == 2) || (nodeData.headerType == 4)) {
                            fields["in"] = getRefData(pathwayData.requestBody.content[Object.keys(pathwayData.requestBody.content)[0]].schema.__ref);
                        }

                        if ((nodeData.headerType == 1) || (nodeData.headerType == 3)) {
                            fields["out"] = getRefData(pathwayData.responses["201"].content[Object.keys(pathwayData.responses["201"].content)[0]].schema.__ref);
                            (fields["out"]["__header"] ??= {})["status"] = "201";
                        }

                        const savedData = await Nodes.findByIdAndUpdate(node.node_id, { fields })

                        nodeToSendItem["node_id"] = savedData._id;
                        nodeToSendItem["data"] = savedData;
                        nodeToSendItem["data"]["fields"] = fields
                    } else {
                        const getRefData = (ref) => getDataFromPath(ref.split("/").slice(1), oas._doc).properties;

                        if ((nodeData.headerType == 2) || (nodeData.headerType == 4)) {
                            fields["in"] = []//getRefData(pathwayData.requestBody.content[Object.keys(pathwayData.requestBody.content)[0]].schema.__ref);
                        }

                        if ((nodeData.headerType == 1) || (nodeData.headerType == 3)) {
                            fields["out"] = [];//getRefData(pathwayData.responses["201"].content[Object.keys(pathwayData.responses["201"].content)[0]].schema.__ref);
                            //(fields["out"]["__header"] ??= {})["status"] = "201";
                        }

                        const savedData = await Nodes.findByIdAndUpdate(node.node_id, { fields })
                        nodeToSendItem["node_id"] = savedData._id;
                        nodeToSendItem["data"] = savedData;
                        nodeToSendItem["data"]["fields"] = fields
                    }
                } else {
                    nodeToSendItem["data"] = nodeData
                }
            } else if (node.type == "apiNode" && node.data.headerType) {
                const oasPathways = parsed.pathname.split("/").slice(1).map((path, index, arr) => (index === arr.length - 1) ? path : "/" + path);
                const pathwayData = getDataFromPath(oasPathways, oas.paths);
                let fields = {};

                if (method === "POST" && pathwayData) {
                    const getRefData = (ref) => getDataFromPath(ref.split("/").slice(1), oas._doc).properties;

                    if ((node.data.headerType == 2) || (node.data.headerType == 4)) {
                        fields["in"] = getRefData(pathwayData.requestBody.content[Object.keys(pathwayData.requestBody.content)[0]].schema.__ref);
                    }

                    if ((node.data.headerType == 1) || (node.data.headerType == 3)) {
                        fields["out"] = getRefData(pathwayData.responses["201"].content[Object.keys(pathwayData.responses["201"].content)[0]].schema.__ref);
                        (fields["out"]["__header"] ??= {})["status"] = "201";
                    }

                    const savedData = await new Nodes({ fields }).save();

                    nodeToSendItem["node_id"] = savedData._id;
                    nodeToSendItem.data["node_data"] = savedData;
                }
            } else if (node.id && node.type == "functionNode") {
                try {
                    // Fetch the node from the database
                    const freshNode = await Nodes.findById(node.id);
            
                    // Handle case where no node is found
                    if (!freshNode) {
                        console.log(`No node found with id: ${node.id}`);
                        return "no nodes";
                    }
            
                    // Convert the document to a plain JavaScript object, including virtuals
                    const nodeData = freshNode.toObject({ virtuals: true });
            
                    // Check if 'fields' property exists in nodeData
                    if (!('fields' in nodeData)) {
                        console.error(`'fields' property not found in node data for id: ${node.id}`);
                    } else {
                        console.log(`Function node found: ${node.id}`, nodeData);
                        nodeToSendItem["data"] = nodeData;
                    }
                } catch (error) {
                    // Log and handle any errors that occur
                    console.error(`Error processing node with id: ${node.id}`, error);
                }
            }
            

            nodesToSend.push(nodeToSendItem);
            return node;

        }));

        if (nodeToSave && change) {
            console.log(JSON.stringify(nodeToSave))
            console.log("updated nodes", nodeToSave)
            Builder.findByIdAndUpdate(endpoint._doc.builder_id, { "nodes": nodeToSave }).then((e) => { })
        }
        fragileBuilder.nodes = nodesToSend
        console.log("hmm")
        res.status(200).json({ issue: false, oas: oas, endpoint: endpoint._doc, builder: fragileBuilder })
    }
    catch (error) {
        console.log(error)
        switch (error.error) {
            case "NoHost":
                res.status(500).json({ message: error.message });
                break;
            case "NoEndpoint":
                res.status(200).json({ issue: error })
                break;
            case "NoBuilder":
                res.status(200).json({ issue: error })
                break;
            default:
                res.status(500).json({ message: error.message });
                break;

        }
    }
})


module.exports = router;


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

function generateRandomString() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 12; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        result += chars[randomIndex];
    }
    return result;
}

async function getFields(req) {
    try {
        const url = "http://" + req.body.hostname + req.body.path + "/" + req.body.method.toLowerCase()
        console.log(url)
        const parsed = new URL(url)
        const oasUrl = `${parsed.protocol}//${parsed.host}`
        const oas = await OAS.findOne({ servers: { $elemMatch: { url: oasUrl } } });

        const splitPath = parsed.pathname.split("/").slice(1);
        const oasPathways = splitPath.map((path, index) => {
            return (index === splitPath.length - 1) ? path : "/" + path;
        });

        console.log(oas)

        const pathwayData = getDataFromPath(oasPathways, oas.paths);
        let fields = {};

        const lastSlashIndex = parsed.pathname.lastIndexOf('/');
        const path = parsed.pathname.substring(0, lastSlashIndex);   // "boop/boop"
        const method = (parsed.pathname.substring(lastSlashIndex + 1)).toUpperCase(); // "boop"

        if (method === "POST" && pathwayData) {
            const refId = pathwayData.requestBody.content[Object.keys(pathwayData.requestBody.content)[0]].schema.__ref;
            const parsedRefId = refId.split("/").slice(1);
            const refData = getDataFromPath(parsedRefId, oas._doc);
            return [refData.properties, method];
        } else {
            return [null, method]
        }
    } catch (e) {
        console.log(e)
    }

}

const getColor = (type) => {
    switch (type) {
        case "integer": return "#a456e5";
        case "string": return "#2bb74a";
        case "array": return "#f1ee07";
        case "boolean": return "#FF4747";
    }
}