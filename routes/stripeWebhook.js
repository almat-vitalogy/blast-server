// server/routes/stripeWebhook.js
const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Stripe needs the raw body. So we do NOT use `express.json()` or `express.urlencoded()` here.
 * We use `express.raw({ type: 'application/json' })` specifically for this router only.
 */

// This router handles only / webhook calls:
router.post(
  '/',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    console.log('[Webhook] Received webhook event.');
    console.log('Using STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET);

    const sig = req.headers['stripe-signature'];
    console.log('[Webhook] Incoming signature:', sig);


    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET // e.g. "whsec_12345"
      );
    } catch (err) {
      console.error('Stripe webhook signature verification failed.', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        // Payment completed
        console.log('[Webhook] Checkout Session completed:', event.data.object.id);
        break;

      case 'invoice.paid':
        // Recurring invoice
        console.log('[Webhook] Invoice paid:', event.data.object.id);
        break;

      case 'invoice.payment_failed':
        // Payment failed
        console.log('[Webhook] Invoice payment failed:', event.data.object.id);
        break;

      case 'customer.subscription.deleted':
        // Subscription canceled
        console.log('[Webhook] Subscription canceled:', event.data.object.id);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Return a response to acknowledge receipt of the event
    res.status(200).json({ received: true });
  }
);

module.exports = router;
