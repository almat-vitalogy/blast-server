const mongoose = require("mongoose");

const utc8Date = () => new Date(Date.now() + 8 * 60 * 60 * 1000);

const ActivitySchema = new mongoose.Schema({
  userEmail: { type: String, required: true, ref: "User", index: true },
  action: { type: String, required: true, index: true },
  updatedAt: { type: Date, default: utc8Date, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed }
});

ActivitySchema.pre('save', function(next) {
  this.updatedAt = utc8Date();
  next();
});

module.exports = mongoose.model("Activity", ActivitySchema);
