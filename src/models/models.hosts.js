const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    oas_spec: {
      required: false,
      type: mongoose.Types.ObjectId,
    },
    sera_dns: {
      required: false,
      type: mongoose.Types.ObjectId,
    },
    net_config: {
      required: true,
      type: Object,
    },
    frwd_config: {
      required: true,
      type: Object,
    },
    sera_config: {
      required: true,
      type: Object,
    },
  },
  { collection: "sera_hosts" }
);

module.exports = mongoose.model("sera_hosts", dataSchema);