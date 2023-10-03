const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    fields: {
        required: true,
        type: Object
    },
}, { collection: "builder_nodes" })

module.exports = mongoose.model('builder_nodes', dataSchema)