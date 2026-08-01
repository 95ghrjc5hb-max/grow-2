import { supabase } from '../config/supabase.js';

export const getIntegrations = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    res.status(200).json({ success: true, data: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
