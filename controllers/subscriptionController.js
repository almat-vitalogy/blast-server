// require("dotenv").config();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// /**
//  * GET /api/subscriptions/:userEmail
//  * Returns all recorded Stripe events for the given user.
//  */
// exports.getSubscriptionData = async (req, res) => {
//   const { userEmail } = req.params;

//   try {
//     console.log('[getSubscriptionData] fetching events for →', userEmail);

//     const subscriptionEvents = await SubscriptionActivity
//       .find({ userEmail })
//       .sort({ createdAt: -1 })
//       .lean();

//     return res.json({
//       userEmail,
//       count: subscriptionEvents.length,
//       subscriptionEvents,
//     });
//   } catch (err) {
//     console.error('[getSubscriptionData] DB error:', err);
//     res.status(500).json({ error: 'Failed to fetch subscription data' });
//   }
// };


require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const SubscriptionActivity = require("../models/SubscriptionActivity");

/* ------------------------------------------------------------------ */
/*  GET  /api/subscriptions/:userEmail                                */
/* ------------------------------------------------------------------ */
exports.getSubscriptionData = async (req, res) => {
  const { userEmail } = req.params;

  try {
    console.log("[getSubscriptionData] fetching events for →", userEmail);

    const subscriptionEvents = await SubscriptionActivity
      .find({ userEmail })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      userEmail,
      count: subscriptionEvents.length,
      subscriptionEvents,
    });
  } catch (err) {
    console.error("[getSubscriptionData] DB error:", err);
    res.status(500).json({ error: "Failed to fetch subscription data" });
  }
};

/* ------------------------------------------------------------------ */
/*  POST /api/stripe/create-checkout-session                          */
/* ------------------------------------------------------------------ */
exports.createCheckoutSession = async (req, res) => {
  try {
    const { priceId, userEmail: emailFromBody } = req.body;
    const userEmail = req.user?.email || emailFromBody;

    console.log("[createCheckoutSession] userEmail received →", userEmail);

    if (!priceId)   return res.status(400).json({ error: "Missing priceId" });
    if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

    // // Success: back to Subscriptions page on the Billing History tab
    // const successUrl = `${process.env.CLIENT_URL}/subscriptions?tab=history&session_id={CHECKOUT_SESSION_ID}`;
    // const cancelUrl  = `${process.env.CLIENT_URL}/subscriptions?tab=plans`;

    const session = await stripe.checkout.sessions.create({
      mode          : "subscription",
      line_items    : [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      metadata      : { userEmail },
      success_url   : `${process.env.CLIENT_URL}/subscriptions?tab=history&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url    : `${process.env.CLIENT_URL}/subscriptions?tab=plans`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error("[createCheckoutSession] Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
};