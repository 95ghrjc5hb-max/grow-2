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

// LEMON SQUEEZY WEBHOOK HANDLER
export const handleLemonSqueezyWebhook = async (req, res) => {
  try {
    const event = req.body;
    console.log("👉 [Lemon Squeezy Webhook Event]:", event?.meta?.event_name);

    const eventName = event?.meta?.event_name;
    const customData = event?.meta?.custom_data || {};
    const workspaceId = customData.workspace_id || customData.org_id;

    if (eventName === 'subscription_created' || eventName === 'subscription_updated' || eventName === 'order_created') {
      const attributes = event?.data?.attributes || {};
      const subscriptionId = event?.data?.id;

      if (workspaceId && workspaceId !== 'default_workspace') {
        const { data, error } = await supabase
          .from("billing_accounts")
          .update({
            meta_plan: "Grow Pro",
            meta_status: "active",
            meta_customers_limit: 500,
            meta_subscription_id: String(subscriptionId || ""),
            updated_at: new Date().toISOString()
          })
          .eq("org_id", workspaceId)
          .select();

        if (error) {
          console.error("❌ [Lemon Squeezy DB Error]:", error);
        } else {
          console.log("✅ [Lemon Squeezy DB Updated Successfully]:", data);
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("❌ [Lemon Squeezy Webhook Error]:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};