import { createLemonSqueezyCheckout } from '../services/lemonSqueezyService.js';
import { supabase } from '../config/supabase.js';

export const createCheckoutSession = async (req, res) => {
  try {
    const { plan, planName, workspaceId } = req.body;
    const requestedPlan = plan || planName;
    
    // Auth Token থেকে আসল Org/User UUID নেওয়া হচ্ছে
    const activeWorkspaceId = req.user?.org_id || req.user?.id || req.headers['x-workspace-id'] || workspaceId;
    const userEmail = req.user?.email || req.body.email || 'customer@example.com';

    if (!requestedPlan) {
      return res.status(400).json({
        success: false,
        error: 'Plan name is required.'
      });
    }

    const normalizedPlan = requestedPlan.toLowerCase();

    let variantId;
    if (normalizedPlan.includes('pro')) {
      variantId = process.env.LEMON_SQUEEZY_PRO_VARIANT_ID;
    } else if (normalizedPlan.includes('premium')) {
      variantId = process.env.LEMON_SQUEEZY_PREMIUM_VARIANT_ID;
    } else if (normalizedPlan.includes('unlimited')) {
      variantId = process.env.LEMON_SQUEEZY_UNLIMITED_VARIANT_ID;
    }

    if (!variantId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan selected or Variant ID missing in environment variables.'
      });
    }

    const checkoutUrl = await createLemonSqueezyCheckout({
      variantId,
      workspaceId: activeWorkspaceId,
      userEmail,
      planName: normalizedPlan
    });

    if (!checkoutUrl) {
      return res.status(500).json({
        success: false,
        error: 'Failed to generate Lemon Squeezy checkout session.'
      });
    }

    return res.status(200).json({
      success: true,
      url: checkoutUrl
    });
  } catch (error) {
    console.error('Lemon Squeezy Checkout Controller Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error.'
    });
  }
};

// ==========================================
// LEMON SQUEEZY WEBHOOK HANDLER (LONG-TERM PRODUCTION READY)
// ==========================================
export const handleLemonSqueezyWebhook = async (req, res) => {
  try {
    const event = req.body;
    const eventName = event?.meta?.event_name;
    
    console.log(`[Lemon Squeezy Webhook] Received event: ${eventName}`);
    
    // Extract metadata & IDs
    const customData = event?.meta?.custom_data || {};
    const workspaceId = customData.workspace_id || customData.org_id;
    const subscriptionId = event?.data?.id;
    const orderId = event?.data?.attributes?.order_id || event?.data?.attributes?.first_subscription_item?.order_id || subscriptionId;
    const renewsAt = event?.data?.attributes?.renews_at || null;
    const status = event?.data?.attributes?.status || 'active';
    
    // Dynamic plan & exact customer limit setup (Matches UI Modal: 500 / 1200 / 3000)
    const planName = customData.plan_name || event?.data?.attributes?.product_name || 'Grow Pro';
    const normalizedPlan = planName.toLowerCase();
    
    let customerLimit = 500;
    if (normalizedPlan.includes('unlimited')) {
      customerLimit = 3000;
    } else if (normalizedPlan.includes('premium')) {
      customerLimit = 1200;
    }

    // Tracked lifecycle events
    const validEvents = [
      'subscription_created', 
      'subscription_updated', 
      'subscription_payment_success',
      'subscription_payment_failed',
      'subscription_canceled',
      'subscription_expired',
      'order_created'
    ];

    if (validEvents.includes(eventName)) {
      if (workspaceId && workspaceId !== 'default_workspace') {
        
        let targetPlan = planName;
        let targetStatus = status;
        let targetLimit = customerLimit;

        // Auto-downgrade logic on expiration/cancellation
        if (eventName === 'subscription_canceled' || eventName === 'subscription_expired') {
          targetPlan = 'Grow Free';
          targetStatus = 'canceled';
          targetLimit = 10;
        } else if (eventName === 'subscription_payment_failed') {
          targetStatus = 'past_due';
        }

        // Base database payload
        const updatePayload = {
          meta_plan: targetPlan,
          meta_status: targetStatus,
          meta_customers_limit: targetLimit,
          meta_subscription_id: String(subscriptionId || ""),
          meta_payment_id: String(orderId || ""),
          meta_renews_at: renewsAt,
          updated_at: new Date().toISOString()
        };

        // Reset customer usage counter to 0 on new billing cycle / successful payment
        if (eventName === 'subscription_payment_success' || eventName === 'subscription_created') {
          updatePayload.meta_customers_used = 0;
        }

        // Secure DB Update (RLS bypassed via backend service key)
        const { data, error } = await supabase
          .from('billing_accounts')
          .update(updatePayload)
          .eq('org_id', workspaceId)
          .select();

        if (error) {
          console.error('[Supabase DB Error] Failed to update billing account:', error);
        } else {
          console.log(`[Success] Billing updated for workspace: \({workspaceId} | Event:\){eventName}`);
        }
      } else {
        console.warn('[Warning] No valid workspace ID found in custom_data. Update skipped.');
      }
    } else {
      console.log(`[Ignored] Event '${eventName}' is not actively tracked.`);
    }

    return res.status(200).json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('[Webhook Error] Processing failed:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};