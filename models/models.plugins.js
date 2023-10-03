const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    owner_id: {
        required: true,
        type: mongoose.Schema.Types.ObjectId
    },
    endpoint: {
        required: true,
        type: String
    },
    order: {
        required: true,
        type: Number
    },
    breakable: {
        required: true,
        type: Boolean
    },
    method: {
        required: true,
        type: String
    },
    in: {
        required: true,
        type: Boolean
    }
})

module.exports = mongoose.model('plugins', dataSchema)