import supabase from '../config/supabase.js';

// ১. শপিফাই স্টোরফ্রন্ট মেসেজ ব্যবহার চেক ও বাড়ানো
export const checkAndIncrementShopifyUsage = async (workspaceId) => {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('shopify_messages_used, shopify_messages_limit, shopify_status')
    .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`)
    .single();

  if (!billing || billing.shopify_status !== 'active') {
    return { allowed: false, reason: 'inactive_plan' };
  }

  if (billing.shopify_messages_used >= billing.shopify_messages_limit) {
    return { allowed: false, reason: 'limit_reached' };
  }

  // কাউন্ট ১ বাড়ানো
  await supabase
    .from('billing_accounts')
    .update({ 
      shopify_messages_used: (billing.shopify_messages_used || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`);

  return { allowed: true };
};

// ২. মেটা চ্যানেল (Messenger, IG, WhatsApp) ইউনিক কাস্টমার চেক ও বাড়ানো
export const checkAndIncrementMetaUsage = async (workspaceId, customerId) => {
  const { data: billing } = await supabase
    .from('billing_accounts')
    .select('meta_customers_used, meta_customers_limit, meta_status')
    .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`)
    .single();

  if (!billing || billing.meta_status !== 'active') {
    return { allowed: false, reason: 'inactive_plan' };
  }

  // ওই কাস্টমারের সাথে আগে কোনো কনভারসেশন ছিল কি না চেক করা
  const { data: existingChat } = await supabase
    .from('conversations')
    .select('id')
    .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`)
    .eq('customer_id', customerId)
    .maybeSingle();

  // যদি সম্পূর্ণ নতুন কাস্টমার হয়, তবে লিমিট চেক করে কাউন্ট ১ বাড়াবে
  if (!existingChat) {
    if (billing.meta_customers_used >= billing.meta_customers_limit) {
      return { allowed: false, reason: 'limit_reached' };
    }

    await supabase
      .from('billing_accounts')
      .update({ 
        meta_customers_used: (billing.meta_customers_used || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .or(`org_id.eq.${workspaceId},workspace_id.eq.${workspaceId}`);
  }

  return { allowed: true };
};