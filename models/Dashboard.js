const mongoose = require('mongoose');

const DashboardSchema = new mongoose.Schema({
    totalContacts: Number,
    messagesSent: Number,
    scheduledBlasts: Number,
    successRate: Number,
    recentBlasts: [{
        title: String,
        status: String,
        completed: String
    }],
    recentActivity: [{
        type: String,
        description: String,
        timestamp: Date
    }]
}, { timestamps: true });

module.exports = mongoose.model('Dashboard', DashboardSchema);
