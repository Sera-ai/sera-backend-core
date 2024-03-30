const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema({
  host_id: {
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: "sera_hosts",
  },
  builder_id: {
    required: false,
    type: mongoose.Schema.Types.ObjectId,
    ref: "builder_inventory",
  },
  endpoint: {
    required: true,
    type: String,
  },
  method: {
    required: true,
    type: String,
  },
  sera_config: {
    required: false,
    type: Object,
  },
});

module.exports = mongoose.model("sera_endpoints", dataSchema);
