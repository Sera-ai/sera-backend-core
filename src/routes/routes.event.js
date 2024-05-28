const express = require("express");
const mongoose = require("mongoose");

const Hosts = require("../models/models.hosts");
const OAS = require("../models/models.oas");
const Builder = require("../models/models.builder");
const EventBuilder = require("../models/models.eventBuilder");
const Nodes = require("../models/models.nodes");
const Edges = require("../models/models.edges");
const Endpoints = require("../models/models.endpoints");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const node_data = await EventBuilder.find();

    const transformedData = node_data.map((item) => {
      return {
        name: `[${item.name}](/events/playbook/${item.slug})`,
        type: item.type,
        enabled: item.enabled,
      };
    });

    res.send(transformedData);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
