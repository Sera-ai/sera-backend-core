const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    nodes: {
      required: true,
      type: Array,
    },
    edges: {
      required: true,
      type: Array,
    },
    slug: {
      required: true,
      type: String,
    },
  },
  { collection: "builder_events" }
);

module.exports = mongoose.model("builder_events", dataSchema);
