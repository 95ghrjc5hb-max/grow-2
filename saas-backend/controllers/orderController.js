import supabase from '../config/supabase.js';

// Get all orders belonging ONLY to the logged-in user
export const getOrders = async (req, res) => {
  try {
    // 1. Safe extraction of userId (Token payload fallback added)
    const userId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.user_id;

    // 2. ⚠️ Safety Check: userId না থাকলে ডাটাবেজে রিকোয়েস্ট না পাঠিয়ে এখানেই আটকে দেওয়া
    if (!userId || userId === 'undefined') {
      return res.status(200).json({
        success: true,
        data: [],
        message: "User not authenticated or ID missing"
      });
    }

    // 3. Query Supabase Database
    // 🔥 FIXED: Changed 'user_id' to 'org_id' to match your Database schema exactly
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('org_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: orders || []
    });
  } catch (error) {
    console.error('[ORDER FETCH ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.user_id;

    if (!userId || userId === 'undefined') {
      return res.status(401).json({
        success: false,
        error: "Unauthorized user action"
      });
    }

    // 🔥 FIXED: Changed 'user_id' to 'org_id' for strict multi-tenant isolation
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('org_id', userId)
      .select();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: data?.[0] || null
    });
  } catch (error) {
    console.error('[ORDER UPDATE ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};