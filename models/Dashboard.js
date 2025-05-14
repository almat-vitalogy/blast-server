const mongoose = require('mongoose');

const DashboardSchema = new mongoose.Schema({
  // Example fields:
  totalContacts: Number,
  messagesSent: Number,
  scheduledBlasts: Number,
  successRate: Number,

  recentBlasts: [{
    title: String,
    status: String,
    sent: Number,
    failed: Number,
    // e.g. date or completed could be included
  }],

  recentActivity: [{
    icon: String,           // or store an identifier for your icon
    text: String,
    time: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Dashboard', DashboardSchema);
