const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    id: {
        required: false,
        type: String
    },
    source: {
        required: false,
        type: String
    },
    target: {
        required: false,
        type: String
    },
    animated: {
        required: false,
        type: Boolean
    },
    style: {
        required: false,
        type: Object
    },
    selected: {
        required: false,
        type: Boolean
    },
    sourceHandle: {
        required: false,
        type: String
    },
    targetHandle: {
        required: false,
        type: String
    },
    type: {
        required: false,
        type: String
    },
}, { collection: "builder_edges" })

module.exports = mongoose.model('builder_edges', dataSchema)