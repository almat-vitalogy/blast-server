const mongoose = require('mongoose');

const BlastMessageSchema = new mongoose.Schema({
  totalContacts: { type: Number, required: true },
  messagesSent: { type: Number, required: true },
  scheduledBlasts: { type: Number, required: true },
  successRate: { type: Number, required: true },

  blasts: [{
    title: { type: String, required: true },
    status: {
      sent: { type: Number, required: true },
      delivered: { type: Number, required: true },
      failed: { type: Number, required: true },
      date: { type: Date, required: true }
    }
  }],

  activities: [{
    icon: { type: String, required: true },   // e.g., 'Send', 'PlusCircle', etc.
    title: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: Date, required: true }
  }]
});

module.exports = mongoose.model('BlastMessage', BlastMessageSchema);


// const userSchema = mongoose.Schema({
//     username: {
//         type: String,
//         required: true,
//         unique: true,
//     },
//     password: {
//         type: String,
//         required: true,
//     },
//     pet: {
//         species: {
//             type: String,
//             required: true,
//             default: " ",
//         },
//         hunger: {
//             type: Number,
//             required: true,
//             default: 50,
//         },
//         name: {
//             type: String,
//             required: true,
//             default: " ",
//         },
//     },
//     balance: {
//         type: Number,
//         required: true,
//         default: 0,
//     },
//     inventory: {
//         meat: {
//             type: Number,
//             required: true,
//             default: 0,
//             max: 5,
//         },
//         vegies: {
//             type: Number,
//             required: true,
//             default: 0,
//             max: 5,
//         },
//     },
//     stats: {
//         lastFed: {
//             type: Date,
//             required: true,
//             default: Date.now,
//         },
//         totalFed: {
//             type: Number,
//             required: true,
//             default: 0,
//         },
//         totalPlayed: {
//             type: Number,
//             required: true,
//             default: 0,
//         },
//         totalExp: {
//             type: Number,
//             required: true,
//             default: 0,
//         },
//         lvl: {
//             type: Number,
//             required: true,
//             default: 1,
//         },
//     },
// });

// const User = mongoose.model("users", userSchema);

// module.exports = mongoose.model('ActivityFeed', ActivityFeedSchema);
