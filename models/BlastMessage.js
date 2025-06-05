const mongoose = require("mongoose");

const utc8Date = () => new Date(Date.now() + 8 * 60 * 60 * 1000);

const BlastMessageSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, ref: "User", index: true },
  scheduled: { type: Boolean, default: false },
  title: { type: String, required: true, index: true },
  scheduledAt: { type: Date, default: utc8Date },
  createdAt: { type: Date, default: utc8Date },
  content: { type: String, required: true },
  contacts: [{ type: String, required: true, index: true }],
});

module.exports = mongoose.model("BlastMessage", BlastMessageSchema);
