const Hosts = require('../models/models.hosts');
const Endpoints = require('../models/models.endpoints');
const Plugins = require('../models/models.plugins');
const { pluginManager, exportRequest, paramFactory } = require("../services/services.plugins")

const dynamicRouteHandler = async (req, res) => {
    //res.send(`Received a ${req.method} request to path: ${req.path}`);
    //search the mongodb to see if the item exists
    let documentedEndpoint = true
    const timerBegin = process.hrtime();//time

    try {
        const hostInfo = req.headers.host.split(":")
        const hostname = hostInfo[0]
        const port = parseInt(hostInfo.length == 2 ? hostInfo[1] : req.protocol.includes("s") ? 443 : 80)
        const host = await Hosts.find({ "hostname": hostname, "port": port });
        const strict = JSON.parse(host[0]._doc.strict)
        const endpoint = await Endpoints.find({ "host_id": host[0]._id, method: req.method, endpoint: req.path })

        if (endpoint.length == 0 && strict) throw "No entries found"
        if (endpoint.length > 1) throw "Multiple entries found"
        if (endpoint.length == 0 && !strict) {
            console.log("SERA NOTICE")
            documentedEndpoint = false
        }

        const timerBeforePlugin = process.hrtime(timerBegin);//time

        const postData = paramFactory(req)
        const hsPlugins = await Plugins.find({ "owner_id": host[0]._id, "in": true }).sort({ order: 1 })
        const epPlugins = !documentedEndpoint ? [] : await Plugins.find({ "owner_id": endpoint[0]._id, "in": true }).sort({ order: 1 })
        const combinedPlugins = [hsPlugins, epPlugins]
        await pluginManager(combinedPlugins)

        const timerAfterPlugin = process.hrtime(timerBegin);//time

        //route through proxy/vpn
        const queryEndpoint = documentedEndpoint ? endpoint[0].endpoint : req.path
        const requestRes = await exportRequest(req.method, `${host[0]._doc.forwards}${queryEndpoint}`, req.protocol.toLowerCase() == "https", postData)

        const timerAfterCall = process.hrtime(timerBegin);//time

        const hsPlugouts = await Plugins.find({ "owner_id": host[0]._id, "in": false }).sort({ order: 1 })
        const epPlugouts = !documentedEndpoint ? [] : await Plugins.find({ "owner_id": endpoint[0]._id, "in": false }).sort({ order: 1 })
        const combinedPlugouts = [hsPlugouts, epPlugouts]
        await pluginManager(combinedPlugouts)

        const timerAfterNextPlugin = process.hrtime(timerBegin); //time

        let requestResEdited = requestRes

        const timeBubble = {
            timerBeforePlugin: calculateElapsedTime(timerBeforePlugin, timerAfterPlugin),
            timerAfterPlugin: calculateElapsedTime(timerAfterPlugin, timerAfterCall),
            timerAfterCall: calculateElapsedTime(timerAfterCall, timerAfterNextPlugin),
            timerAfterNextPlugin: calculateElapsedTime(timerAfterNextPlugin, timerAfterNextPlugin),
            totalTime: calculateElapsedTime(timerBeforePlugin, timerAfterNextPlugin)
        };

        console.log(timeBubble)

        JSON.parse(endpoint[0]._doc.debug) ? requestResEdited.push(timeBubble) : null
        res.send(requestResEdited)
    } catch (e) {
        console.log(e)
        res.send(e)
    }
};

function calculateElapsedTime(start, end) {
    return ((end[0] * 1000 + end[1] / 1e6) - (start[0] * 1000 + start[1] / 1e6)).toFixed(2) + "ms";
}

module.exports = {
    dynamicRouteHandler
}