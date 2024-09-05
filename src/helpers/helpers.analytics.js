const { format, subDays, subWeeks, subMonths, subHours, startOfDay, startOfWeek, startOfMonth, startOfHour, isBefore, isAfter, addDays } = require('date-fns');


// Helper function to get the start of the period
const getStartOfPeriod = (date, period) => {
    switch (period) {
        case 'hourly':
            return startOfHour(date);
        case 'daily':
            return startOfDay(date);
        case 'weekly':
            return startOfWeek(date, { weekStartsOn: 1 }); // Assuming week starts on Monday
        case 'monthly':
            return startOfMonth(date);
        default:
            return startOfMonth(date);
    }
};

// Helper function to get the previous periods
const getPreviousPeriods = (date, period, count) => {
    const periods = [];
    let current = date;
    for (let i = 0; i < count; i++) {
        periods.push(getStartOfPeriod(current, period));
        switch (period) {
            case 'hourly':
                current = subHours(current, 1);
                break;
            case 'daily':
                current = subDays(current, 1);
                break;
            case 'weekly':
                current = subWeeks(current, 1);
                break;
            case 'monthly':
                current = subMonths(current, 1);
                break;
            default:
                current = subMonths(current, 1);
        }
    }
    return periods.reverse();
};

const organizeData = (node_data, period, count = 5) => {
    const currentDate = new Date();
    const periods = getPreviousPeriods(currentDate, period, count);
    const dataMap = {};

    // Initialize dataMap for each period
    periods.forEach((startOfPeriod, index) => {
        const endOfPeriod = index < periods.length - 1 ? periods[index + 1] : new Date();
        console.log(startOfPeriod, endOfPeriod)
        const name = format(startOfPeriod, "yyyy-MM-dd'T'HH:mm:ss.SSSX");
        dataMap[name] = { name, req: 0, error: 0 };

        node_data.forEach(item => {
            const date = new Date(item.ts * 1000);

            if (isAfter(date, startOfPeriod) && isBefore(date, endOfPeriod)) {
                console.log(date, startOfPeriod, endOfPeriod)
                console.log(date, isAfter(date, startOfPeriod))
                console.log(date, isBefore(date, endOfPeriod))

                dataMap[name].req += 1;
                if (item.response.status >= 400) {
                    dataMap[name].error += 1;
                }
            }
        });
    });

    console.log(dataMap)

    return Object.values(dataMap);
};

const createSankeyData = (node_data) => {
    const nodes = [];
    const nodeIndex = {};
    const links = [];
    const linkIndex = {};

    // Helper function to get or create a node index
    const getNodeIndex = (name) => {
        if (nodeIndex[name] === undefined) {
            nodeIndex[name] = nodes.length;
            nodes.push({ name, index: nodes.length });
        }
        return nodeIndex[name];
    };

    // Helper function to get or create a link index
    const getLinkIndex = (source, target) => {
        const key = `${source}-${target}`;
        if (linkIndex[key] === undefined) {
            linkIndex[key] = links.length;
            links.push({ source, target, value: 1 });
        } else {
            links[linkIndex[key]].value += 1;
        }
        return linkIndex[key];
    };

    node_data.forEach(item => {
        const ip = item.session_analytics.ip_address;
        const apiType = "API - JSON";
        const hostname = item.hostname;
        const path = item.path;
        const method = item.method;

        const ipIndex = getNodeIndex(ip);
        const apiTypeIndex = getNodeIndex(apiType);
        const hostnameIndex = getNodeIndex(hostname);
        const pathIndex = getNodeIndex(path);
        const methodIndex = getNodeIndex(method);

        getLinkIndex(ipIndex, apiTypeIndex);
        getLinkIndex(apiTypeIndex, hostnameIndex);
        getLinkIndex(hostnameIndex, pathIndex);
        getLinkIndex(pathIndex, methodIndex);
    });

    return { nodes, links };
};

const createRadarChartData = (node_data, startTimestamp, endTimestamp, sera_settings) => {
    const totalRequests = node_data.length;
    const successfulRequests = node_data.filter(item => item.response.status === 200).length;
    const uptime = (totalRequests - node_data.filter(item => item.response.status >= 400).length) / totalRequests * 100;
    const latency = node_data.reduce((acc, item) => acc + item.response_time, 0) / totalRequests;
    const timePeriodInSeconds = endTimestamp - startTimestamp;
    const rps = (totalRequests / timePeriodInSeconds) * 100;
    const successRate = (successfulRequests / totalRequests) * 100;

    const { Builders, Inventory, Latency, RPS, Success, Uptime } = sera_settings.systemSettings.seraSettings.healthMetrics;

    return [
        {
            subject: "RPS",
            description: "Percent of overall RPS",
            actual: rps.toFixed(5) + " rps",
            value: (parseFloat(rps.toFixed(5)) / parseFloat(RPS)) * 100,
            cap: 100,
        },
        {
            subject: "Uptime",
            description: "Percent of time since last restart that this has been available",
            actual: uptime / Uptime * 100 + "%",
            value: uptime / Uptime * 100,
            cap: 100,
        },
        {
            subject: "Success",
            description: "Percent of responses that are 200 (Status Ok)",
            actual: successRate + "%",
            value: successRate,
            cap: 100,
        },
        {
            subject: "Inventory",
            actual: "100%",
            description: "Percent of OAS documentation that have descriptions",
            value: 100,
            cap: Inventory,
        },
        {
            subject: "Builders",
            actual: "100%",
            description: "Percent of endpoints that have builders setup",
            value: 100,
            cap: Builders,
        },
        {
            subject: "Latency",
            actual: latency.toFixed(2) + "ms",
            description: `Average Latency of requests that are above ${Latency}ms`,
            value: (Latency / latency * 100) > 100 ? 100 : parseFloat((Latency / latency * 100).toFixed(2)),
            cap: 100,
        }
    ];
};

const getHostData = (nodeData) => {
    const details = {
        Status: "Active",
        "Endpoint Type": "REST API",
        Methods: [...new Set(nodeData.map(entry => entry.method).filter(Boolean))],
        Protocols: [...new Set(nodeData.map(entry => entry.ssl_analytics?.protocol).filter(Boolean))],
        Encryption: [...new Set(nodeData.flatMap(entry => entry.ssl_analytics?.cipher).filter(Boolean))],
        Authentication: [...new Set(nodeData.map(entry => entry.session_analytics?.auth_type).filter(Boolean))],
    };

    const statistics = {
        Requests: nodeData.length.toString(),
        "Avg. Response": (nodeData.reduce((sum, entry) => sum + (entry.response_time ?? 0), 0) / nodeData.length).toFixed(2) + "ms",
        "Failed Req": nodeData.filter(entry => entry.response?.status >= 400).length.toString(),
        "Unique Clients": [...new Set(nodeData.map(entry => entry.session_analytics?.ip_address).filter(Boolean))].length.toString(),
    };

    return { details, statistics };
};

module.exports = {
    organizeData,
    createSankeyData,
    createRadarChartData,
    getHostData
}