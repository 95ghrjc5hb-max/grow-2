import  supabase  from '../config/supabase.js';

export const getIntegrations = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    let query = supabase.from('integrations').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('[GET INTEGRATIONS ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      data: []
    });
  }
};
