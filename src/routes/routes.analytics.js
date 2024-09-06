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

/**
 * @group Analytics Endpoints
 * Registers routes for managing analytics, logs, usage, and host data with the Fastify server.
 *
 * This function sets up several endpoints to retrieve analytics, logs, usage statistics, and host data, with options to filter based on time periods, hosts, paths, and methods.
 * The available routes are:
 *
 * - **GET** `/manage/analytics`: Retrieves various charts (area, sankey, radar) based on transaction logs and specified time periods.
 * - **GET** `/manage/logs`: Retrieves system and Sera logs, filtering and extracting log data based on time periods and log types.
 * - **GET** `/manage/usage`: Retrieves usage statistics based on hosts, paths, methods, and specified time periods.
 * - **GET** `/manage/hostdata`: Retrieves host-related data, filtered by hosts, paths, and methods.
 */

// Example usage in your route
async function routes(fastify, options) {

  /**
   * @async
   * @function getManageAnalytics
   * @group Analytics Endpoints
   * @param {object} request - The Fastify request object.
   * @param {Object} reply - The Fastify reply object.
   *
   * @summary Retrieves endpoint analytics, including charts for specific periods and hosts.
   * @param {Object} request.query - The query parameters for retrieving analytics.
   * @param {string} request.query.period - The time period for the analytics (e.g., hourly, daily, weekly, monthly, custom).
   * @param {string} [request.query.host] - The hostname to filter analytics.
   * @param {string} [request.query.startDate] - The start date for custom period analytics (required for custom period).
   * @param {string} [request.query.endDate] - The end date for custom period analytics (required for custom period).
   * @returns {Object} The charts data for the specified period, including endpoint area, sankey, and radar charts.
   * @throws {Error} If an error occurs while retrieving the analytics data.
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
   * @async
   * @function getManageLogs
   * @group Analytics Endpoints
   * @param {object} request - The Fastify request object.
   * @param {Object} reply - The Fastify reply object.
   *
   * @summary Retrieves system and Sera logs, filtering by log type and extracting timestamped log data from the last 100 lines.
   * @param {Object} request.query - The query parameters for retrieving logs.
   * @param {string} request.query.period - The time period for retrieving logs.
   * @param {string} request.query.type - The type of logs to retrieve (e.g., seraLogs, systemLogs).
   * @returns {Array<Object>} A list of log entries, each with a timestamp, type, and message.
   * @throws {Error} If an error occurs while retrieving the log data.
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
   * @async
   * @function getManageUsage
   * @group Analytics Endpoints
   * @param {object} request - The Fastify request object.
   * @param {Object} reply - The Fastify reply object.
   *
   * @summary Retrieves usage statistics filtered by hosts, paths, methods, and time periods.
   * @param {Object} request.query - The query parameters for retrieving usage data.
   * @param {string} request.query.period - The time period for usage statistics (e.g., hourly, daily, weekly, monthly, custom).
   * @param {string} [request.query.host] - The hostname to filter usage data.
   * @param {string} [request.query.path] - The path to filter usage data.
   * @param {string} [request.query.method] - The HTTP method to filter usage data.
   * @returns {Object} The usage graph data for the specified period.
   * @throws {Error} If an error occurs while retrieving the usage data.
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
   * @async
   * @function getManageHostData
   * @group Analytics Endpoints
   * @param {object} request - The Fastify request object.
   * @param {Object} reply - The Fastify reply object.
   *
   * @summary Retrieves detailed host data, filtering by hosts, paths, methods, and time periods.
   * @param {Object} request.query - The query parameters for retrieving host data.
   * @param {string} request.query.period - The time period for the host data (e.g., hourly, daily, weekly, monthly, custom).
   * @param {string} [request.query.host] - The hostname to filter host data.
   * @param {string} [request.query.path] - The path to filter host data.
   * @param {string} [request.query.method] - The HTTP method to filter host data.
   * @returns {Object} The filtered host data for the specified period.
   * @throws {Error} If an error occurs while retrieving the host data.
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
