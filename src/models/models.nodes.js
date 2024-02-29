const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    width: {
        required: false,
        type: Number
    },
    height: {
        required: false,
        type: Number
    },
    data: {
        required: false,
        type: Object
    },
    type: {
        required: false,
        type: String
    },
    className: {
        required: false,
        type: String
    },
    position: {
        required: false,
        type: Object
    },
    selected: {
        required: false,
        type: Boolean
    },
    positionAbsolute: {
        required: false,
        type: Object
    },
    dragging: {
        required: false,
        type: Boolean
    },
    id: {
        required: false,
        type: String
    },
}, { collection: "builder_nodes", minimize: false })

module.exports = mongoose.model('builder_nodes', dataSchema)