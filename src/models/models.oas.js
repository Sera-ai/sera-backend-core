const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    servers: {
      required: true,
      type: Array,
    },
    paths: {
      required: true,
      type: Object,
      default: {}, // Set an empty object as the default value
    },
  },
  { collection: "oas_inventory", strict: false }
);

module.exports = mongoose.model("oas_inventory", dataSchema);
