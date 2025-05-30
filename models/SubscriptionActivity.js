/**
 * server/models/SubscriptionActivity.js
 *
 * Lean audit log for subscription billing events (only invoice.paid is
 * persisted by the webhook).  All timestamps are stored as UTC+8, matching
 * Activity.js.
 */

const mongoose = require('mongoose');

/* ---------- helpers ---------------------------------------------------- */
const utc8Date = () => new Date(Date.now() + 8 * 60 * 60 * 1000);

/* ---------- embedded line-item schema ---------------------------------- */
const LineItemSchema = new mongoose.Schema(
  {
    priceId : { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false }
);

/* ---------- main schema ------------------------------------------------ */
const SubscriptionActivitySchema = new mongoose.Schema(
  {
    /* core identifiers -------------------------------------------------- */
    eventId  : { type: String, required: true, unique: true, index: true },
    eventType: { type: String, required: true, index: true },

    /* ownership --------------------------------------------------------- */
    userEmail: { type: String, required: true, index: true },

    /* relationships ----------------------------------------------------- */
    subscriptionId   : { type: String, index: true },
    invoiceId        : String,
    paymentIntentId  : String,

    /* money & period ---------------------------------------------------- */
    amountPaid   : Number,              // e.g. 99.00  (major unit)
    currency     : String,              // hkd / usd / …
    billingReason: String,
    periodStart  : Date,                // already shifted to UTC+8
    periodEnd    : Date,                // already shifted to UTC+8

    /* status & docs ----------------------------------------------------- */
    status           : String,
    hostedInvoiceUrl : String,
    invoicePdf       : String,

    /* snapshot of items (optional) ------------------------------------- */
    lineItems: { type: [LineItemSchema], default: undefined },

    /* housekeeping ------------------------------------------------------ */
    createdAt: { type: Date, default: utc8Date },
  },
  { versionKey: false }
);

module.exports = mongoose.model('SubscriptionActivity', SubscriptionActivitySchema);
