// server/models/Label.js
const mongoose = require("mongoose");

const { Schema, model, models } = mongoose;

/**
 * Label schema
 *  - name:      Visible text of the label (unique per collection)
 *  - color:     Optional hex or Tailwind color class
 *  - userEmail: Owner’s email (required, globally unique)
 *  - contactIds: Array of Contact ObjectIds for quick reverse look-ups
 */
const labelSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    color: {
      type: String,
      default: "#3b82f6", // optional convenience default
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    contactIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Contact",
      },
    ],
  },
  { timestamps: true }
);

// Re-use existing model in hot-reload/dev to avoid OverwriteModelError
module.exports = models.Label || model("Label", labelSchema);
