const mongoose = require("mongoose");

const AgentSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },

  contacts: [{
    phone: { type: String, required: true },
    name: { type: String, default: function() { return this.phone; } },
    labels: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
  }],

  blastMessages: [{
    scheduled: { type: Boolean, default: false },
    title: String,
    sent: { type: Number, default: 0 },
    delivered: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    scheduledAt: { type: Date, default: () => new Date(Date.now() + 8 * 60 * 60 * 1000) },
    createdAt: { type: Date, default: () => new Date(Date.now() + 8 * 60 * 60 * 1000) }, 
    content: String,
    status: { type: String, default: "Scheduled" }
  }],

  activities: [{
    action: { type: String, required: true },
    datetime: { type: Date, default: () => new Date(Date.now() + 8 * 60 * 60 * 1000) }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}); 

AgentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Agent", AgentSchema);
