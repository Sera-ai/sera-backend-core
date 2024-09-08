/**
 * @module ManageAnalytics
 * @description API endpoints for managing analytics and logs.
 */

const fastifyPlugin = require('fastify-plugin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const logsDirectory = path.join('/workspace/.logs');
const timestampRegex1 = /\b(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})\b/; // YYYY/MM/DD HH:MM:SS
const timestampRegex2 = /\[(\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+\d{4})\]/; // [24/Jun/2024:21:37:38 +0000]
const TX_LOGS = require("../models/models.tx_logs");
const seraSettings = require("../models/models.sera_settings");

const {
  organizeData,
  createSankeyData,
  createRadarChartData,
  getHostData
} = require("../helpers/helpers.analytics")


async function routes(fastify, options) {

  /**
   * @name GET /manage/analytics
   * @description Fetch analytics data for different time periods.
   * @param {string} [period=query] - Time period for fetching analytics ('hourly', 'daily', 'weekly', 'monthly', or 'custom').
   * @param {string} [host=query] - Filter analytics data by specific host.
   * @return {endpointAreaChart} **object** - Data for area chart visualization.
   * @return {endpointSankeyChart} **object** - Data for Sankey chart visualization.
   * @return {endpointRadialChart} **object** - Data for radial chart visualization.
   * @example
   * GET /manage/analytics?period=daily&host=myhost.com
   */
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

  /**
   * @name GET /manage/logs
   * @description Fetch recent log entries from server logs.
   * @param {string} [period=query] - Time period for fetching logs ('hourly', 'daily', 'weekly', 'monthly', or 'custom').
   * @param {string} [type=query] - Type of log to fetch (e.g., 'seraLogs', 'systemLogs').
   * @return {logs} **object** - Recent log entries sorted by timestamp.
   * @return {types} **object** - Available log types and their corresponding log files.
   * @example
   * GET /manage/logs?period=weekly&type=seraLogs
   */
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

  /**
   * @name GET /manage/usage
   * @description Fetch usage data filtered by time period, host, and HTTP method.
   * @param {string} [period=query] - Time period for fetching usage data ('hourly', 'daily', 'weekly', 'monthly', or 'custom').
   * @param {string} [host=query] - Filter usage data by specific host.
   * @param {string} [path=query] - Filter usage data by request path.
   * @param {string} [method=query] - Filter usage data by HTTP method (e.g., 'GET', 'POST').
   * @return {usageGraph} **object** - Data for the usage graph visualization.
   * @example
   * GET /manage/usage?period=hourly&host=myhost.com&method=GET
   */
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

  /**
   * @name GET /manage/hostdata
   * @description Fetch detailed data for a specific host.
   * @param {string} [period=query] - Time period for fetching host data ('hourly', 'daily', 'weekly', 'monthly', or 'custom').
   * @param {string} [host=query] - Filter host data by specific hostname.
   * @param {string} [path=query] - Filter host data by request path.
   * @param {string} [method=query] - Filter host data by HTTP method (e.g., 'GET', 'POST').
   * @return {hostData} **object** - Host-specific data based on the provided filters.
   * @example
   * GET /manage/hostdata?period=daily&host=myhost.com&method=GET
   */
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
