import { createLemonSqueezyCheckout } from '../services/lemonSqueezyService.js';
import { supabase } from '../config/supabase.js';

export const createCheckoutSession = async (req, res) => {
    try {
        const { plan, planName, workspaceId } = req.body;
        const requestedPlan = plan || planName;

        // 1. Robust Org ID extraction (Strict multi-tenant fallback)
        let activeWorkspaceId = req.user?.org_id || req.orgId || req.headers['x-workspace-id'] || workspaceId;
        
        // If org_id is still missing, resolve from organization_members via user.id
        if (!activeWorkspaceId && req.user?.id) {
            const { data: member } = await supabase
                .from('organization_members')
                .select('org_id')
                .eq('user_id', req.user.id)
                .maybeSingle();
            activeWorkspaceId = member?.org_id;
        }

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
            planName: requestedPlan
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
        console.error('[Lemon Squeezy Checkout Controller Error]:', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Internal server error.'
        });
    }
};

// LEMON SQUEEZY WEBHOOK HANDLER (ENTERPRISE AUTOMATED)
export const handleLemonSqueezyWebhook = async (req, res) => {
    try {
        const event = req.body;
        const eventName = event?.meta?.event_name;

        console.log(`[Lemon Squeezy Webhook] Received event: ${eventName}`);

        // 1. Extract metadata & IDs
        const customData = event?.meta?.custom_data || {};
        let workspaceId = customData.workspace_id || customData.org_id;
        const subscriptionId = event?.data?.id ? String(event.data.id) : null;
        const orderId = String(
            event?.data?.attributes?.order_id ||
            event?.data?.attributes?.first_subscription_item?.order_id ||
            event?.data?.attributes?.order_number ||
            ""
        );
        const renewsAt = event?.data?.attributes?.renews_at || null;
        const rawStatus = (event?.data?.attributes?.status || 'active').toLowerCase();

        // 2. Fallback: If custom_data is missing on recurring events, lookup via subscription ID
        if (!workspaceId && subscriptionId) {
            const { data: existingAccount } = await supabase
                .from('billing_accounts')
                .select('org_id')
                .eq('meta_subscription_id', subscriptionId)
                .maybeSingle();

            if (existingAccount?.org_id) {
                workspaceId = existingAccount.org_id;
                console.log(`[Lemon Squeezy Webhook] Resolved workspaceId ${workspaceId} from existing subscription record.`);
            }
        }

        const planName = customData.plan_name || event?.data?.attributes?.product_name || 'Grow Pro';
        const normalizedPlan = planName.toLowerCase();

        // 3. Dynamic customer limits
        let customerLimit = 500;
        if (normalizedPlan.includes('unlimited')) {
            customerLimit = 5000;
        } else if (normalizedPlan.includes('premium')) {
            customerLimit = 1200;
        }

        const validEvents = [
            'subscription_created',
            'subscription_updated',
            'subscription_payment_success',
            'subscription_payment_failed',
            'subscription_cancelled',
            'subscription_expired',
            'order_created'
        ];

        if (!validEvents.includes(eventName)) {
            console.log(`[Ignored] Event '${eventName}' is not actively tracked.`);
            return res.status(200).json({ success: true, message: 'Event ignored.' });
        }

        if (!workspaceId || workspaceId === 'default_workspace') {
            console.warn('[Warning] No valid workspace ID found in custom_data or database. Webhook update skipped.');
            return res.status(200).json({ success: true, message: 'No target workspace identified.' });
        }

        let targetPlan = planName;
        let targetStatus = 'active'; // Default active on valid payment
        let targetLimit = customerLimit;

        // 4. Strict Status Normalization (Fixes "paid" not becoming "active")
        if (['paid', 'active', 'on_trial', 'trialing'].includes(rawStatus)) {
            targetStatus = 'active';
        } else if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired' || rawStatus === 'cancelled' || rawStatus === 'expired') {
            targetPlan = 'Grow Free';
            targetStatus = 'canceled';
            targetLimit = 50;
        } else if (eventName === 'subscription_payment_failed' || rawStatus === 'past_due' || rawStatus === 'unpaid') {
            targetStatus = 'past_due';
        }

        const updatePayload = {
            meta_plan: targetPlan,
            meta_status: targetStatus,
            meta_customers_limit: targetLimit,
            meta_subscription_id: subscriptionId || "",
            meta_payment_id: orderId || "",
            meta_renews_at: renewsAt,
            updated_at: new Date().toISOString()
        };

        // Reset usage counter on new subscription or successful billing cycle
        if (eventName === 'subscription_payment_success' || eventName === 'subscription_created' || eventName === 'order_created') {
            updatePayload.meta_customers_used = 0;
        }

        // 5. Database Upsert/Update by matching org_id or workspace_id
        const { data: existingRecord } = await supabase
            .from('billing_accounts')
            .select('id')
            .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`)
            .maybeSingle();

        let dbResult;
        if (existingRecord) {
            dbResult = await supabase
                .from('billing_accounts')
                .update(updatePayload)
                .eq('id', existingRecord.id)
                .select();
        } else {
            dbResult = await supabase
                .from('billing_accounts')
                .insert({
                    ...updatePayload,
                    org_id: workspaceId,
                    workspace_id: workspaceId
                })
                .select();
        }

        if (dbResult.error) {
            console.error('[Supabase DB Error] Failed to update billing accounts:', dbResult.error);
            return res.status(500).json({ success: false, error: dbResult.error.message });
        }

        console.log(`[Success] Billing successfully activated for workspace: ${workspaceId} | Status: ${targetStatus} | Plan: ${targetPlan}`);
        return res.status(200).json({ success: true, message: 'Billing updated successfully.' });

    } catch (error) {
        console.error('[Webhook Error] Processing failed:', error);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
};