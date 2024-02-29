const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    hostname: {
        required: true,
        type: Array
    },
    port: {
        required: true,
        type: Array
    },
    forwards: {
        required: true,
        type: String
    },
    strict: {
        required: true,
        type: String
    }
})

module.exports = mongoose.model('hosts', dataSchema)