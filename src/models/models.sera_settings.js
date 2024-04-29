const mongoose = require("mongoose");

const dataSchema = new mongoose.Schema(
  {
    user: {
      required: true,
      type: String,
    },
    firstName: {
      required: true,
      type: String,
    },
    lastName: {
      required: false,
      type: String,
    },
    toastables: {
      required: false,
      type: Array,
    },
  },
  { collection: "sera_settings", strict: false }
);

module.exports = mongoose.model("sera_settings", dataSchema);
