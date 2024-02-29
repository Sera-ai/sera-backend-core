const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    host: {
        required: true,
        type: String
    },
    paths: {
        required: true,
        type: Object
    },
    definitions: {
        required: true,
        type: Object
    }
}, { collection: "oas_inventory" })

module.exports = mongoose.model('oas_inventory', dataSchema)