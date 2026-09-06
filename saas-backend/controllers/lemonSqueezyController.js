import { createLemonSqueezyCheckout } from '../services/lemonSqueezyService.js';

export const createCheckoutSession = async (req, res) => {
  try {
    const { plan, planName, workspaceId } = req.body;
    const requestedPlan = plan || planName;
    const activeWorkspaceId = req.headers['x-workspace-id'] || workspaceId;
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
      workspaceId: activeWorkspaceId || 'default_workspace',
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