import { supabase } from '../config/supabase.js';

const DB_TIMEOUT_MS = 8000;
const MAX_ATOMIC_RETRIES = 3;

/**
 * Helper: Enforces a strict timeout on Supabase queries so a hanging DB connection
 * fails closed instead of hanging the worker indefinitely.
 */
const withTimeout = async (promise, label = 'supabase_query') => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`TIMEOUT: ${label} exceeded ${DB_TIMEOUT_MS}ms`));
    }, DB_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * 1. 【entity-Shopify¦canonical_name=SHOPIFY】 Storefront Usage Tracking (1 message = 1 count)
 * Strictly Fail-Closed + Atomic Compare-And-Swap Increment
 */
export const checkAndIncrementShopifyUsage = async (orgId) => {
  if (!orgId) {
    return { allowed: false, reason: 'invalid_org' };
  }

  try {
    for (let attempt = 0; attempt < MAX_ATOMIC_RETRIES; attempt++) {
      const { data: billing, error } = await withTimeout(
        supabase
          .from('billing_accounts')
          .select('id, shopify_messages_used, shopify_messages_limit, shopify_status')
          .eq('org_id', orgId)
          .maybeSingle(),
        'fetch_shopify_billing'
      );

      if (error || !billing) {
        console.error('[【entity-SHOPIFY¦canonical_name=SHOPIFY】 USAGE BLOCKED]: Billing fetch failed or missing:', error?.message || 'no_record');
        return { allowed: false, reason: error ? 'db_error' : 'inactive_plan' };
      }

      const status = String(billing.shopify_status || '').trim().toLowerCase();
      if (status !== 'active') {
        return { allowed: false, reason: 'inactive_plan' };
      }

      const rawUsed = billing.shopify_messages_used;
      const currentUsed = Number(rawUsed) || 0;
      const limit = Number(billing.shopify_messages_limit) || 0;

      if (limit <= 0 || currentUsed >= limit) {
        return { allowed: false, reason: 'limit_reached' };
      }

      // FIXED: NULL case - IS NULL er sathe LT ek sathe dio na, karon NULL < limit kokhono TRUE hoy na
      let updateQuery = supabase
        .from('billing_accounts')
        .update({
          shopify_messages_used: currentUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', billing.id);

      if (rawUsed === null || rawUsed === undefined) {
        updateQuery = updateQuery.is('shopify_messages_used', null);
      } else {
        updateQuery = updateQuery.eq('shopify_messages_used', currentUsed).lt('shopify_messages_used', limit);
      }

      const { data: updatedRow, error: updateErr } = await withTimeout(
        updateQuery.select('id, shopify_messages_used').maybeSingle(),
        'increment_shopify_usage'
      );

      if (updateErr) {
        console.error('[SHOPIFY USAGE BLOCKED]: Failed to increment shopify_messages_used:', updateErr.message);
        return { allowed: false, reason: 'db_error' };
      }

      if (updatedRow) {
        return { allowed: true };
      }
    }

    console.warn(`[SHOPIFY USAGE BLOCKED]: Concurrency conflict after ${MAX_ATOMIC_RETRIES} retries for org ${orgId}`);
    return { allowed: false, reason: 'concurrency_conflict' };
  } catch (err) {
    console.error('[SHOPIFY USAGE CRITICAL ERROR]:', err.message);
    return { allowed: false, reason: 'server_error' };
  }
};

/**
 * Helper: Atomically increments billing_accounts.meta_customers_used by 1
 * only if meta_status is 'active' and meta_customers_used < meta_customers_limit.
 */
const atomicIncrementMetaCustomerQuota = async (orgId, initialBilling = null) => {
  for (let attempt = 0; attempt < MAX_ATOMIC_RETRIES; attempt++) {
    let billing = initialBilling;

    if (attempt > 0 || !billing) {
      const { data, error } = await withTimeout(
        supabase
          .from('billing_accounts')
          .select('id, org_id, meta_plan, meta_status, meta_customers_limit, meta_customers_used, updated_at')
          .eq('org_id', orgId)
          .maybeSingle(),
        'refetch_meta_billing'
      );

      if (error || !data) {
        console.error('[USAGE ERROR]: Failed to fetch billing_accounts during atomic increment:', error?.message || 'no_record');
        return { allowed: false, reason: error ? 'db_error' : 'inactive_plan' };
      }
      billing = data;
    }

    const currentStatus = String(billing.meta_status || '').trim().toLowerCase();
    if (currentStatus !== 'active') {
      console.warn(`[AI BLOCKED]: Workspace ${orgId} status is '${currentStatus}', expected 'active'`);
      return { allowed: false, reason: 'inactive_plan' };
    }

    const rawUsed = billing.meta_customers_used;
    const usedCustomers = Number(rawUsed) || 0;
    const customerLimit = Number(billing.meta_customers_limit) || 0;

    if (customerLimit <= 0 || usedCustomers >= customerLimit) {
      console.warn(`[USAGE LIMIT REACHED]: Used ${usedCustomers} of ${customerLimit} customers.`);
      return { allowed: false, reason: 'limit_reached' };
    }

    // FIXED: NULL handling - IS NULL + LT ek sathe na
    let updateQuery = supabase
      .from('billing_accounts')
      .update({
        meta_customers_used: usedCustomers + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billing.id);

    if (rawUsed === null || rawUsed === undefined) {
      updateQuery = updateQuery.is('meta_customers_used', null);
    } else {
      updateQuery = updateQuery.eq('meta_customers_used', usedCustomers).lt('meta_customers_used', customerLimit);
    }

    const { data: updatedBilling, error: updateBillingErr } = await withTimeout(
      updateQuery.select('id, meta_customers_used, meta_customers_limit').maybeSingle(),
      'increment_meta_customers_used'
    );

    if (updateBillingErr) {
      console.error('[USAGE SERVICE]: Failed to increment meta_customers_used:', updateBillingErr.message);
      return { allowed: false, reason: 'db_error' };
    }

    if (updatedBilling) {
      console.log(
        `[USAGE INCREMENT SUCCESS]: Org ${orgId} meta_customers_used: ${updatedBilling.meta_customers_used}/${updatedBilling.meta_customers_limit}`
      );
      return { allowed: true };
    }
  }

  console.warn(`[USAGE SERVICE]: Concurrency conflict incrementing meta_customers_used for org ${orgId}`);
  return { allowed: false, reason: 'concurrency_conflict' };
};

/**
 * 2. 【entity-Meta¦canonical_name=Meta】 Channels Usage Tracking (Messenger, IG, WhatsApp)
 * Charges 1 customer credit per 20 messages per unique customer (Msg 1, 21, 41, 61...)
 * Strictly Fail-Closed + Atomic Increment
 */
export const checkAndIncrementMetaUsage = async (orgId, customerIdentifier) => {
  if (!orgId || !customerIdentifier) {
    console.error('[USAGE ERROR]: Missing orgId or customerIdentifier');
    return { allowed: false, reason: 'invalid_parameters' };
  }

  try {
    const { data: billing, error: billingErr } = await withTimeout(
      supabase
        .from('billing_accounts')
        .select('id, org_id, meta_plan, meta_status, meta_customers_limit, meta_customers_used, updated_at')
        .eq('org_id', orgId)
        .maybeSingle(),
      'fetch_meta_billing'
    );

    console.log('[USAGE DEBUG - DB QUERY RESULT]:', {
      meta_plan: billing?.meta_plan || null,
      meta_status: billing?.meta_status || null,
      meta_customers_limit: billing?.meta_customers_limit ?? null,
      meta_customers_used: billing?.meta_customers_used ?? null,
      databaseError: billingErr || null,
    });

    if (billingErr || !billing) {
      console.error('[USAGE ERROR]: Supabase billing query failed or no billing record found:', billingErr?.message || 'no_record');
      return { allowed: false, reason: billingErr ? 'db_error' : 'inactive_plan' };
    }

    const currentStatus = String(billing.meta_status || '').trim().toLowerCase();
    if (currentStatus !== 'active') {
      console.warn(`[AI BLOCKED]: Workspace ${orgId} status is '${currentStatus}', expected 'active'`);
      return { allowed: false, reason: 'inactive_plan' };
    }

    const customerLimit = Number(billing.meta_customers_limit) || 0;
    const usedCustomers = Number(billing.meta_customers_used) || 0;

    if (customerLimit <= 0) {
      console.warn(`[USAGE LIMIT REACHED]: Invalid or zero customer limit (${customerLimit}) for org ${orgId}`);
      return { allowed: false, reason: 'limit_reached' };
    }

    for (let attempt = 0; attempt < MAX_ATOMIC_RETRIES; attempt++) {
      const { data: existingChat, error: chatErr } = await withTimeout(
        supabase
          .from('conversations')
          .select('id, message_count')
          .eq('org_id', orgId)
          .eq('customer_identifier', String(customerIdentifier))
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        'fetch_conversation_count'
      );

      if (chatErr) {
        console.error('[USAGE SERVICE]: Error fetching conversation (fail-closed):', chatErr.message);
        return { allowed: false, reason: 'db_error' };
      }

      const rawPrevCount = existingChat?.message_count;
      const prevCount = Number(rawPrevCount) || 0;
      const currentMessageCount = prevCount + 1;
      const isNewQuotaBlock = prevCount === 0 || currentMessageCount % 20 === 1;

      if (isNewQuotaBlock && usedCustomers >= customerLimit && attempt === 0) {
        console.warn(`[USAGE LIMIT REACHED]: Used ${usedCustomers} of ${customerLimit} customers.`);
        return { allowed: false, reason: 'limit_reached' };
      }

      let didIncrementConversation = false;

      if (existingChat?.id) {
        let convUpdateQuery = supabase
          .from('conversations')
          .update({
            message_count: currentMessageCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingChat.id);

        if (rawPrevCount === null || rawPrevCount === undefined) {
          convUpdateQuery = convUpdateQuery.is('message_count', null);
        } else {
          convUpdateQuery = convUpdateQuery.eq('message_count', prevCount);
        }

        const { data: updatedChat, error: convUpdateErr } = await withTimeout(
          convUpdateQuery.select('id, message_count').maybeSingle(),
          'increment_conversation_count'
        );

        if (convUpdateErr) {
          console.error('[USAGE SERVICE]: Failed to update conversation message_count:', convUpdateErr.message);
          return { allowed: false, reason: 'db_error' };
        }

        if (!updatedChat) {
          continue;
        }
        didIncrementConversation = true;
      } else {
        // FIXED: Conversation ekhane banabo na. inboundWorker banabe.
        // Eita 1st message dhore shudhu quota charge korbo.
        didIncrementConversation = false;
      }

      if (isNewQuotaBlock) {
        const quotaResult = await atomicIncrementMetaCustomerQuota(orgId, billing);
        if (!quotaResult.allowed) {
          if (didIncrementConversation && existingChat?.id) {
            await supabase
              .from('conversations')
              .update({ message_count: prevCount })
              .eq('id', existingChat.id)
              .eq('message_count', currentMessageCount);
          }
          return quotaResult;
        }
      }

      return { allowed: true };
    }

    console.warn(`[USAGE SERVICE]: Concurrency conflict on conversation ${customerIdentifier} for org ${orgId}`);
    return { allowed: false, reason: 'concurrency_conflict' };
  } catch (err) {
    console.error('[USAGE SERVICE CRITICAL ERROR]:', err.message);
    return { allowed: false, reason: 'server_error' };
  }
};