import { supabase } from '../config/supabase.js';

// Enterprise Helper: Resolves Org ID safely from DB (Profiles & Members)
const resolveUserOrgId = async (userId) => {
  if (!userId || userId === 'undefined') return null;

  try {
    // 1. Check organization_members table first
    const { data: member } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (member?.org_id) return member.org_id;

    // 2. Check profiles table (Supabase public table name)
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .limit(1)
      .maybeSingle();

    if (profile?.org_id) return profile.org_id;

    // 3. Fallback: Check if user owns an active integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('org_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    return integration?.org_id || null;
  } catch (err) {
    console.error('[ORG RESOLUTION WARNING]:', err.message);
    return null;
  }
};

// 1. Get all orders belonging to the organization
export const getOrders = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    if (!userId || userId === 'undefined') {
      return res.status(200).json({ success: true, data: [] });
    }

    // Resolve tenant org_id dynamically
    const orgId = req.headers['x-org-id'] || await resolveUserOrgId(userId);

    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    // Filter strictly by org_id if resolved
    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: orders, error } = await query;
    if (error) throw error;
console.log('👉 SUPABASE FOUND ORDERS:', orders?.length, orders);
    return res.status(200).json({
      success: true,
      data: orders || []
    });
  } catch (error) {
    console.error('[ORDER FETCH ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 2. Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    const orgId = req.headers['x-org-id'] || await resolveUserOrgId(userId);

    let query = supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query.select();
    if (error) throw error;

    return res.status(200).json({ success: true, data: data?.[0] || null });
  } catch (error) {
    console.error('[ORDER STATUS UPDATE ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// 3. Edit Full Order Details
export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    const orgId = req.headers['x-org-id'] || await resolveUserOrgId(userId);

    const updatePayload = { ...req.body, updated_at: new Date().toISOString() };
    delete updatePayload.id;
    delete updatePayload.org_id;

    let query = supabase
      .from('orders')
      .update(updatePayload)
      .eq('id', id);

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data, error } = await query.select();
    if (error) throw error;

    return res.status(200).json({ success: true, data: data?.[0] || null });
  } catch (error) {
    console.error('[ORDER UPDATE ERROR]:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
};