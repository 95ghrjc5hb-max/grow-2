import { supabase } from '../config/supabase.js';

/**
 * 1. Shopify Storefront Usage Tracking (1 message = 1 count)
 */
export const checkAndIncrementShopifyUsage = async (orgId) => {
  try {
    const { data: billing, error } = await supabase
      .from('billing_accounts')
      .select('shopify_messages_used, shopify_messages_limit, shopify_status')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error || !billing || billing.shopify_status !== 'active') {
      return { allowed: false, reason: 'inactive_plan' };
    }

    const currentUsed = billing.shopify_messages_used || 0;
    const limit = billing.shopify_messages_limit || 0;

    if (currentUsed >= limit) {
      return { allowed: false, reason: 'limit_reached' };
    }

    // Increment shopify messages count by 1
    await supabase
      .from('billing_accounts')
      .update({
        shopify_messages_used: currentUsed + 1,
        updated_at: new Date().toISOString()
      })
      .eq('org_id', orgId);

    return { allowed: true };
  } catch (err) {
    console.error('Error in checkAndIncrementShopifyUsage:', err);
    return { allowed: false, reason: 'server_error' };
  }
};

/**
 * 2. Meta Channels Usage Tracking (Messenger, IG, WhatsApp)
 * Charges 1 customer credit per 20 messages per unique customer (Msg 1, 21, 41, 61...)
 */
export const checkAndIncrementMetaUsage = async (orgId, customerIdentifier) => {
  try {
    // 1. Fetch current billing plan status and limits
    const { data: billing, error: billingErr } = await supabase
      .from('billing_accounts')
      .select('meta_customers_used, meta_customers_limit, meta_status')
      .eq('org_id', orgId)
      .maybeSingle();

    if (billingErr || !billing || billing.meta_status !== 'active') {
      return { allowed: false, reason: 'inactive_plan' };
    }

    // 2. Fetch existing conversation using customer_identifier
    const { data: existingChat, error: chatErr } = await supabase
      .from('conversations')
      .select('id, message_count')
      .eq('org_id', orgId)
      .eq('customer_identifier', customerIdentifier)
      .maybeSingle();

    if (chatErr) {
      console.error('Error fetching conversation in usageService:', chatErr.message);
    }

    const prevCount = existingChat?.message_count || 0;
    const currentMessageCount = prevCount + 1;

    // Trigger quota charge on message #1, #21, #41, #61, etc.
    const isNewQuotaBlock = prevCount === 0 || currentMessageCount % 20 === 1;

    if (isNewQuotaBlock) {
      const usedCustomers = billing.meta_customers_used || 0;
      const customerLimit = billing.meta_customers_limit || 0;

      // Block if workspace has exceeded customer quota
      if (usedCustomers >= customerLimit) {
        return { allowed: false, reason: 'limit_reached' };
      }

      // Deduct 1 customer credit from billing account
      await supabase
        .from('billing_accounts')
        .update({
          meta_customers_used: usedCustomers + 1,
          updated_at: new Date().toISOString()
        })
        .eq('org_id', orgId);
    }

    // 3. Keep message count synced in conversations table
    if (existingChat?.id) {
      await supabase
        .from('conversations')
        .update({
          message_count: currentMessageCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingChat.id);
    }

    return { allowed: true };
  } catch (err) {
    console.error('Error in checkAndIncrementMetaUsage:', err);
    return { allowed: false, reason: 'server_error' };
  }
};