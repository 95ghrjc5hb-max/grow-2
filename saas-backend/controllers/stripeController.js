import Stripe from 'stripe';
import { supabase } from '../config/supabase.js';

// Initialize Stripe with your Secret Key from .env
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

export const createCheckoutSession = async (req, res) => {
    try {
        const { planName } = req.body;

        // Get workspaceId from the authenticated user
        const workspaceId = req.user?.id || req.body.workspaceId;

        if (!workspaceId) {
            console.error("Checkout Error: Missing Workspace ID");
            return res.status(400).json({ error: "Missing Workspace ID" });
        }

        const priceIds = {
            "Grow Pro $29": process.env.STRIPE_PRICE_PRO || "price_1xxxxxx",
            "Grow Premium $59": process.env.STRIPE_PRICE_PREMIUM || "price_2xxxxxx",
            "Grow Unlimited $100": process.env.STRIPE_PRICE_UNLIMITED || "price_3xxxxxx"
        };

        const priceId = priceIds[planName];
        if (!priceId) return res.status(400).json({ error: 'Invalid plan selected' });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            client_reference_id: workspaceId,
            metadata: {
                planName: planName,
                workspaceId: workspaceId
            },
            // 🔥 THE HIDDEN MISTAKE FIX: Tell Stripe to explicitly save workspaceId in the recurring subscription!
            subscription_data: {
                metadata: {
                    planName: planName,
                    workspaceId: workspaceId
                }
            },
            success_url: `${req.headers.origin}/settings?payment=success`,
            cancel_url: `${req.headers.origin}/settings?payment=cancelled`,
        });

        res.status(200).json({ url: session.url });
    } catch (err) {
        console.error("[STRIPE ERROR]:", err.message);
        res.status(500).json({ error: err.message });
    }
};

// Stripe Webhook Handler
export const handleStripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder');
    } catch (err) {
        console.error(`[WEBHOOK ERROR]: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 1. FIRST TIME BUYING THE PLAN
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        const workspaceId = session.metadata?.workspaceId || session.client_reference_id;
        const planName = session.metadata?.planName || 'Grow Pro $29';

        let tokenLimit = 30;
        if (planName.includes("Pro")) tokenLimit = 500;
        if (planName.includes("Premium")) tokenLimit = 1200;
        if (planName.includes("Unlimited")) tokenLimit = 3000;

        try {
            if (!workspaceId) {
                console.error("❌ ERROR: Stripe session did not return a workspaceId");
                return res.status(200).json({ received: true });
            }

            const payload = {
                org_id: workspaceId,
                workspace_id: workspaceId,
                plan_name: planName,
                token_limit: tokenLimit,
                tokens_used: 0, 
                price_label: planName.split(' ')[2] + '/mo',
                status: 'active',
                updated_at: new Date().toISOString()
            };

            const { data: existing } = await supabase
                .from('billing_accounts')
                .select('id')
                .eq('workspace_id', workspaceId)
                .maybeSingle();

            if (existing) {
                await supabase.from('billing_accounts').update(payload).eq('workspace_id', workspaceId);
            } else {
                await supabase.from('billing_accounts').insert([payload]);
            }

            console.log(`✅ [PAYMENT SUCCESS] Workspace ${workspaceId} upgraded to ${planName}`);
        } catch (err) {
            console.error("❌ [SUPABASE ERROR]:", err.message);
        }
    }
    // 2. MONTHLY AUTO-RENEWAL (The real magic)
    else if (event.type === 'invoice.payment_succeeded') {
        const invoice = event.data.object;
        
        // Fetch the subscription to reliably get the metadata we saved during checkout
        if (invoice.subscription) {
            try {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                const workspaceId = subscription.metadata?.workspaceId;
                
                if (workspaceId) {
                    await supabase
                        .from('billing_accounts')
                        .update({
                            tokens_used: 0,
                            status: 'active',
                            updated_at: new Date().toISOString()
                        })
                        .eq('workspace_id', workspaceId);
                    console.log(`🔄 [MONTHLY RENEWAL] Workspace ${workspaceId} tokens reset to 0`);
                }
            } catch (err) {
                console.error("❌ [RENEWAL ERROR]:", err.message);
            }
        }
    }

    res.status(200).json({ received: true });
};