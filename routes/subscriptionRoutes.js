const express = require("express");
const router  = express.Router();

const {
  getSubscriptionData,   // GET /:userEmail
  createCheckoutSession, // POST /create-checkout-session
} = require("../controllers/subscriptionController");

/* ------------------------------------------------------------------ */
/*  Public endpoints                                                  */
/* ------------------------------------------------------------------ */

// Return billing-history documents for a specific user
router.get("/:userEmail", getSubscriptionData);

// Create a Stripe Checkout session (kept here so “/api/subscriptions/…” stays grouped)
router.post("/create-checkout-session", createCheckoutSession);

module.exports = router;
