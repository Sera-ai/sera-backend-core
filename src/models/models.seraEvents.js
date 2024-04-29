const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    event: {
      required: true,
      type: String,
    },
    type: {
      required: true,
      type: String,
    },
    data: {
      required: true,
      type: Object,
      default: {}, // Set an empty object as the default value
    },
  },
  { collection: "sera_events", strict: false }
);

module.exports = mongoose.model("sera_events", dataSchema);
