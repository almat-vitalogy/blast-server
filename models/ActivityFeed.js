const mongoose = require('mongoose');

const ActivityFeedSchema = new mongoose.Schema({
  icon: String,
  title: String,
  description: String,
  timestamp: String
});

module.exports = mongoose.model('ActivityFeed', ActivityFeedSchema);
