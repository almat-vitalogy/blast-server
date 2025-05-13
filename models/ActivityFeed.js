const mongoose = require('mongoose');

const ActivityFeedSchema = new mongoose.Schema({
    activities: [{
        type: String,
        message: String,
        timestamp: Date
    }]
}, { timestamps: true });

module.exports = mongoose.model('ActivityFeed', ActivityFeedSchema);
