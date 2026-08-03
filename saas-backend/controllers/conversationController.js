import supabase from '../config/supabase.js';

// Get all conversations for logged-in user
export const getConversations = async (req, res) => {
  try {
    // 1. First, declare and extract userId
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    // 2. NOW perform the safety check
    if (!userId || userId === 'undefined') {
      return res.status(200).json({
        success: true,
        data: [],
        message: "User not authenticated or ID missing"
      });
    }

    // 3. Query Supabase
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: conversations || []
    });

  } catch (error) {
    console.error('[CONVERSATION FETCH ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
