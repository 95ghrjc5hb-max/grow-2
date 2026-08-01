import  supabase  from '../config/supabase.js';

// Get all orders belonging ONLY to the logged-in user
export const getOrders = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: { orders: orders || [] }
    });
  } catch (error) {
    console.error('🔴 [ORDER FETCH ERROR]:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user?.userId || req.user?.id;

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('user_id', userId)
      .select();

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: data[0] || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
