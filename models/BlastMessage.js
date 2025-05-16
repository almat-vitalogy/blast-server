const mongoose = require('mongoose');

const BlastMessageSchema = new mongoose.Schema({
  title: String,              // e.g., "🎉 Birthday Promo"
  sent: Number,               // Total messages sent
  delivered: Number,          // Total delivered successfully
  failed: Number,             // Total failures
  date: String,               // e.g., "2025-04-29 15:00"
  status: {                   // "Completed", "Scheduled", etc.
    type: String,
    default: "Scheduled"
  },
  activity: {                 // Corresponding activity log entry
    icon: String,             // Icon identifier
    description: String,      // Detailed description
    timestamp: String         // Time like "2 mins ago", "Yesterday"
  }
});

module.exports = mongoose.model('BlastMessage', BlastMessageSchema);
