const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    sera_config: {
      required: true,
      type: Object,
    },
  },
  { collection: "sera_dns" }
);

module.exports = mongoose.model("sera_dns", dataSchema);
