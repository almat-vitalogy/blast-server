/**
 * server/routes/stripeWebhook.js                             v2.2.0
 *
 * Persists ONLY `invoice.paid` using the lean schema above.
 */

const express  = require('express');
const router   = express.Router();
const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
const SubscriptionActivity = require('../models/SubscriptionActivity');

/* ───────── helper: UTC+8 converter ───────── */
const toUtc8 = (unix) => (unix ? new Date(unix * 1000 + 8 * 60 * 60 * 1000) : null);

/* ───────── helper: first e-mail we can find or fetch ───────── */
async function findUserEmail(o) {
  const email =
    o?.metadata?.userEmail ||
    o?.customer_email ||
    o?.customer_details?.email ||
    o?.email ||
    o?.billing_details?.email ||
    o?.charges?.data?.[0]?.billing_details?.email ||
    null;
  if (email) return email.trim().toLowerCase();

  if (o?.customer) {
    try {
      const c = await stripe.customers.retrieve(o.customer);
      return c?.email ? c.email.trim().toLowerCase() : null;
    } catch (e) {
      console.warn('[stripeWebhook] customer lookup failed:', e.message);
    }
  }
  return null;
}

/* ───────── mapper: Stripe invoice → DB doc ───────── */
function mapInvoicePaid({ eventId, eventType, userEmail, invoice }) {
  const doc = {
    userEmail,
    eventId,
    eventType,                    // 'invoice.paid'
    subscriptionId : invoice.subscription ?? null,
    invoiceId      : invoice.id,
    amountPaid     : invoice.amount_paid != null
                      ? invoice.amount_paid / 100      
                      : null,
    currency       : invoice.currency ?? null,
    periodStart    : toUtc8(invoice.period_start),
    periodEnd      : toUtc8(invoice.period_end),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    invoicePdf      : invoice.invoice_pdf ?? null,
    status          : invoice.status ?? null,
  };

  /* add lineItems ONLY if the invoice has them */
  if (Array.isArray(invoice.lines?.data) && invoice.lines.data.length) {
    doc.lineItems = invoice.lines.data.map(li => ({
      priceId : li.price?.id ?? 'unknown',
      quantity: li.quantity ?? 1,
    }));
  }

  return doc;
}


/* pick the correct signing secret based on livemode flag */
function pickSecret(livemode) {
  return livemode
    ? process.env.STRIPE_LIVE_WEBHOOK_SECRET   // live account secret
    : process.env.STRIPE_TEST_WEBHOOK_SECRET;  // test account secret
}


/* ───────── generic handler factory ───────── */
function makeHandler(signingSecret, mode) {
  return [
    /* raw body needed for signature verification */
    express.raw({ type: 'application/json' }),

    /* debug tap – remove when stable */
    (req, _res, next) => {
      console.log(`--- STRIPE DEBUG (${mode.toUpperCase()}) ---`);
      console.log('sig  :', req.headers['stripe-signature']);
      console.log('ctype:', req.headers['content-type']);
      console.log('len  :', req.headers['content-length'], '| buf:', req.body?.length);
      console.log('-----------------------------------------');
      next();
    },

    /* main handler */
    async (req, res) => {
      const sig = req.headers['stripe-signature'];
      const buf = req.body;
      let event;

      /* 1. verify signature with the mode-specific secret */
      try {
        event = stripe.webhooks.constructEvent(buf, sig, signingSecret);
      } catch (err) {
        console.error(`[stripeWebhook] bad sig (${mode}) :`, err.message);
        return res.status(400).send('Webhook Error: bad signature');
      }

      const { id: eventId, type: eventType, data } = event;

      /* 2. idempotency */
      if (await SubscriptionActivity.exists({ eventId })) {
        return res.status(200).json({ received: true });
      }

      /* 3. persist ONLY invoice.paid */
      if (eventType !== 'invoice.paid') {
        console.log(`[stripeWebhook] ${eventType} (${mode}) → skipped`);
        return res.status(200).json({ received: true });
      }

      const userEmail = await findUserEmail(data.object);
      console.log(`[stripeWebhook] invoice.paid (${mode}) for →`, userEmail ?? '«none»');
      if (!userEmail) return res.status(200).json({ received: true });

      try {
        const doc = mapInvoicePaid({
          eventId,
          eventType,
          userEmail,
          invoice: data.object,
        });
        await SubscriptionActivity.create(doc);
      } catch (err) {
        console.error('[stripeWebhook] DB save error:', err);
        return res.status(500).send('Save Error');
      }

      /* optional side-effects */
      try {
        await afterInvoicePaid(data.object);
      } catch (err) {
        console.error('[stripeWebhook] handler error:', err);
      }

      return res.status(200).json({ received: true });
    },
  ];
}

/* stub for follow-up work */
async function afterInvoicePaid(invoice) {
  console.log('invoice.paid stored:', invoice.id);
}

/* ───────── register the two endpoints ─────────
   index.js mounts this module at /stripe/webhook,
   so the final URLs are:
     • /stripe/webhook/test
     • /stripe/webhook/live                                          */
router.post(
  '/test',
  ...makeHandler(process.env.STRIPE_TEST_WEBHOOK_SECRET, 'test')
);

router.post(
  '/live',
  ...makeHandler(process.env.STRIPE_LIVE_WEBHOOK_SECRET, 'live')
);

module.exports = router;