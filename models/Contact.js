const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, ref: "User", index: true },
  phone: { type: String, required: true, index: true },
  name: {
    type: String,
    default: function () {
      return this.phone;
    },
  },
  labels: [{ type: String }],
});

ContactSchema.index({ userEmail: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model("Contact", ContactSchema);
