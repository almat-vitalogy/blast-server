const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, default: function() { return this.phone; } },
});

module.exports = mongoose.model("Contact", ContactSchema);
