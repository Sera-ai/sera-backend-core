const fastifyPlugin = require('fastify-plugin');
const mongoose = require("mongoose");

const TX_LOGS = require("../models/models.tx_logs");


const { format, subDays, subWeeks, subMonths, startOfDay, startOfWeek, startOfMonth, isBefore, isAfter, addDays } = require('date-fns');

// Helper function to get the start of the period
const getStartOfPeriod = (date, period) => {
  switch (period) {
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

const organizeData = (node_data, period) => {
  const currentDate = new Date();
  const periods = getPreviousPeriods(currentDate, period, 5);
  const dataMap = {};

  // Initialize dataMap for each period
  periods.forEach((startOfPeriod, index) => {
    const endOfPeriod = index < periods.length - 1 ? periods[index + 1] : new Date();
    const name = format(startOfPeriod, period === 'monthly' ? 'MMM' : "yyyy-MM-dd'T'HH:mm:ss.SSSX");
    dataMap[name] = { name, req: 0, error: 0 };

    node_data.forEach(item => {
      const date = new Date(item.ts * 1000);
      if (isAfter(date, startOfPeriod) && isBefore(date, endOfPeriod)) {
        dataMap[name].req += 1;
        if (item.response.status >= 400) {
          dataMap[name].error += 1;
        }
      }
    });
  });

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
// Example usage in your route
async function routes(fastify, options) {
  fastify.get("/manage/analytics", async (request, reply) => {
    try {
      const { period } = request.query;

      let startTimestamp, endTimestamp;
      const currentDate = new Date();

      switch (period) {
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

      const query = { ts: { $gte: startTimestamp, $lte: endTimestamp } };
      const node_data = await TX_LOGS.find(query);

      const endpointAreaChart = organizeData(node_data, period);
      const endpointSankeyChart = createSankeyData(node_data);

      reply.send({
        endpointAreaChart: endpointAreaChart,
        endpointSankeyChart: endpointSankeyChart
      });
    } catch (error) {
      reply.status(500).send({ message: error.message });
    }
  });
}
module.exports = fastifyPlugin(routes);
