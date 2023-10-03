const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    host_id: {
        required: true,
        type: mongoose.Schema.Types.ObjectId
    },
    endpoint: {
        required: true,
        type: String
    },
    method: {
        required: true,
        type: String
    },
    debug: {
        required: false,
        type: Boolean
    },
    rely: {
        required: false,
        type: Boolean
    },
    builder_id: {
        required: false,
        type: mongoose.Schema.Types.ObjectId
    }
})

module.exports = mongoose.model('endpoints', dataSchema)