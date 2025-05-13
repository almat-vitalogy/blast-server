const mongoose = require('mongoose');

const BlastDashboardSchema = new mongoose.Schema({
    blasts: [{
        title: String,
        sent: Number,
        delivered: Number,
        failed: Number,
        date: Date
    }]
}, { timestamps: true });

module.exports = mongoose.model('BlastDashboard', BlastDashboardSchema);
