const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    fields: {
        required: false,
        type: Object
    },
    header: {
        required: false,
        type: Object
    },
    headerType: {
        required: false,
        type: Number
    },
}, { collection: "builder_nodes" })

module.exports = mongoose.model('builder_nodes', dataSchema)