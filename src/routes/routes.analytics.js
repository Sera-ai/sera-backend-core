const fastifyPlugin = require('fastify-plugin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');


const logsDirectory = path.join('/workspace/.logs');
const timestampRegex1 = /\b(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\b/; // YYYY/MM/DD HH:MM:SS
const timestampRegex2 = /\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\]/; // [24/Jun/2024:21:37:38 +0000]
const TX_LOGS = require("../models/models.tx_logs");
const seraSettings = require("../models/models.sera_settings");
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

// Example usage in your route
async function routes(fastify, options) {
  fastify.get("/manage/analytics", async (request, reply) => {
    try {
      const { period, host } = request.query;

      let startTimestamp, endTimestamp;
      const currentDate = new Date();

      switch (period) {
        case "hourly":
          startTimestamp = new Date(currentDate.setHours(currentDate.getHours() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "daily":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "weekly":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 7 * 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "monthly":
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "custom":
          if (!request.query.startDate || !request.query.endDate) {
            return reply.status(400).send({ message: "Custom period requires startDate and endDate" });
          }
          startTimestamp = parseFloat(request.query.startDate);
          endTimestamp = parseFloat(request.query.endDate);
          break;
        default:
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 1)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
      }

      let query = { ts: { $gte: startTimestamp, $lte: endTimestamp } };
      if (host) {
        query.hostname = host;
      }

      const node_data = await TX_LOGS.find(query);
      const sera_settings = await seraSettings.findOne({ "user": "admin" });

      const endpointAreaChart = organizeData(node_data, period);
      const endpointSankeyChart = createSankeyData(node_data);
      const endpointRadialChart = createRadarChartData(node_data, startTimestamp, endTimestamp, sera_settings);

      reply.send({
        endpointAreaChart: endpointAreaChart,
        endpointSankeyChart: endpointSankeyChart,
        endpointRadialChart: endpointRadialChart
      });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/logs", async (request, reply) => {
    try {
      const { period, type } = request.query;

      const typeManager = {
        seraLogs: ["be_Builder.log",
          "be_Processor.log",
          "be_Socket.log",
          "be_Sequencer.log"
        ],
        systemLogs: ["nginx-error.log", "nginx-timing.log"]
      }

      const numLines = 100; // Number of lines you want to read from the end of each file

      async function readLastLines(filePath, numLines) {
        return new Promise((resolve, reject) => {
          const stream = fs.createReadStream(filePath, { encoding: 'utf8', autoClose: true });
          const rl = readline.createInterface({
            input: stream,
            crlfDelay: Infinity
          });

          const lines = [];
          rl.on('line', (line) => {
            lines.push(line);
            if (lines.length > numLines) {
              lines.shift();
            }
          });

          rl.on('close', () => {
            resolve(lines.join('\n'));
          });

          rl.on('error', (err) => {
            reject(err);
          });
        });
      }

      function parseTimestamp(timestamp) {
        if (timestampRegex1.test(timestamp)) {
          return new Date(timestamp.replace(/\//g, '-')).getTime();
        } else if (timestampRegex2.test(timestamp)) {
          const [day, month, year, hour, minute, second, timezone] = timestamp.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) (\+\d{4})/).slice(1);
          const monthNames = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
          const parsedDate = new Date(Date.UTC(year, monthNames[month], day, hour, minute, second));
          return parsedDate.getTime();
        }
        return null;
      }

      const logTypes = []

      async function extractTimestamps(content, type) {
        return content.map(line => {
          const match = line.match(timestampRegex1) || line.match(timestampRegex2);
          const message = line.split("|").length > 1 ? line.split("|").slice(1).join("|").trim() : line;
          const ts = match ? parseTimestamp(match[0]) : null;
          return { ts, type, message };
        }).filter(item => item.ts !== null); // Filter out null values
      }

      try {
        // Read directory and get all filenames
        const files = await fs.promises.readdir(logsDirectory);

        // Map filenames to promises that read the last "X" lines of the file content
        const fileReadPromises = files.filter((file) => type ? file == type : true).map(async (file) => {
          const filePath = path.join(logsDirectory, file);
          logTypes.push({ type: file, name: file, entries: [file] })
          const content = await readLastLines(filePath, numLines);
          const timestamps = await extractTimestamps(content.split('\n'), file);
          return timestamps;
        });

        // Wait for all file read operations to complete
        const fileContents = await Promise.all(fileReadPromises);

        // Print out each file's name, its last "X" lines of content, and extracted timestamps
        reply.send({ types: typeManager, logs: fileContents.flat().sort((a, b) => b.ts - a.ts) })
      } catch (err) {
        console.error(`Error reading files: ${err}`);
      }
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/usage", async (request, reply) => {
    try {
      const { period, host, path, method } = request.query;

      let startTimestamp, endTimestamp;
      const currentDate = new Date();

      switch (period) {
        case "hourly":
          startTimestamp = new Date(currentDate.setHours(currentDate.getHours() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "daily":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "weekly":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 7 * 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "monthly":
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "custom":
          if (!request.query.startDate || !request.query.endDate) {
            return reply.status(400).send({ message: "Custom period requires startDate and endDate" });
          }
          startTimestamp = parseFloat(request.query.startDate);
          endTimestamp = parseFloat(request.query.endDate);
          break;
        default:
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 1)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
      }

      let query = { ts: { $gte: startTimestamp, $lte: endTimestamp } };

      if (host) {
        query.hostname = host;
      }

      if (path) {
        query.path = path;
      }

      if (method) {
        query.method = method.toUpperCase();
      }
      console.log(query);
      const node_data = await TX_LOGS.find(query);
      const endpointAreaChart = organizeData(node_data, period, 50);

      reply.send({
        usageGraph: endpointAreaChart
      });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

  fastify.get("/manage/hostdata", async (request, reply) => {
    try {
      const { period, host, path, method } = request.query;

      let startTimestamp, endTimestamp;
      const currentDate = new Date();

      switch (period) {
        case "hourly":
          startTimestamp = new Date(currentDate.setHours(currentDate.getHours() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "daily":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "weekly":
          startTimestamp = new Date(currentDate.setDate(currentDate.getDate() - 7 * 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "monthly":
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 5)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
        case "custom":
          if (!request.query.startDate || !request.query.endDate) {
            return reply.status(400).send({ message: "Custom period requires startDate and endDate" });
          }
          startTimestamp = parseFloat(request.query.startDate);
          endTimestamp = parseFloat(request.query.endDate);
          break;
        default:
          startTimestamp = new Date(currentDate.setMonth(currentDate.getMonth() - 1)).getTime() / 1000;
          endTimestamp = new Date().getTime() / 1000;
          break;
      }

      let query = { ts: { $gte: startTimestamp, $lte: endTimestamp } };

      if (host) {
        query.hostname = host;
      }

      if (path) {
        query.path = path;
      }

      if (method) {
        query.method = method.toUpperCase();
      }
      console.log(query);
      const node_data = await TX_LOGS.find(query);
      const hostData = getHostData(node_data);

      reply.send({
        hostData: hostData
      });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });

}

module.exports = fastifyPlugin(routes);
