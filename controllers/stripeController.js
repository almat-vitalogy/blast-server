require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/stripe/create-checkout-session
 * Body: { priceId: string, userEmail?: string }
 */
exports.createCheckoutSession = async (req, res) => {
  try {
    const { priceId, userEmail: emailFromBody } = req.body;
    const userEmail = req.user?.email || emailFromBody;   // JWT > body

    console.log('[createCheckoutSession] userEmail received →', userEmail);

    if (!priceId)   return res.status(400).json({ error: 'Missing priceId' });
    if (!userEmail) return res.status(400).json({ error: 'Missing userEmail' });

    const session = await stripe.checkout.sessions.create({
      mode           : 'subscription',
      line_items     : [{ price: priceId, quantity: 1 }],
      customer_email : userEmail,          // visible in Stripe Dashboard
      metadata       : { userEmail },      // persisted for webhook
      success_url   : `${process.env.CLIENT_URL}/subscriptions?tab=history&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url    : `${process.env.CLIENT_URL}/subscriptions?tab=plans`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    console.error('[createCheckoutSession] Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
