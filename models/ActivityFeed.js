const mongoose = require('mongoose');

const ActivityFeedSchema = new mongoose.Schema({
  activities: [{
    icon: String,    // e.g. 'Send', 'PlusCircle', etc.
    title: String,
    description: String,
    timestamp: String  // or Date
  }]
}, { timestamps: true });

module.exports = mongoose.model('ActivityFeed', ActivityFeedSchema);
