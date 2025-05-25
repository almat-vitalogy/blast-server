const mongoose = require("mongoose");

const utc8Date = () => new Date(Date.now() + 8 * 60 * 60 * 1000);

const BlastMessageSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, ref: "User", index: true },
  // messageId: { type: String, unique: true, index: true, default: () => new mongoose.Types.ObjectId().toHexString() },
  scheduled: { type: Boolean, default: false },
  title: { type: String, required: true, index: true },
  // sent: { type: Number, default: 0 },
  // delivered: { type: Number, default: 0 },
  // failed: { type: Number, default: 0 },
  scheduledAt: { type: Date, default: utc8Date },
  createdAt: { type: Date, default: utc8Date },
  content: { type: String, required: true },
  // status: { type: String, default: "Scheduled", index: true },
  contacts: [{ type: String, required: true, index: true }],
});

// BlastMessageSchema.pre('save', function(next) {
//   this.updatedAt = utc8Date();
//   next();
// });

module.exports = mongoose.model("BlastMessage", BlastMessageSchema);
