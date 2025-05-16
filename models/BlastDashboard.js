const mongoose = require('mongoose');

const BlastDashboardSchema = new mongoose.Schema({
  title: String,
  sent: Number,
  delivered: Number,
  failed: Number,
  date: String
});

module.exports = mongoose.model('BlastDashboard', BlastDashboardSchema);
