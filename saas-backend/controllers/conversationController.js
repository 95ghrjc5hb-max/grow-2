import { supabase } from '../config/supabase.js';

// Get all conversations for the Unified Inbox
export const getConversations = async (req, res) => {
  try {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({
      success: true,
      data: conversations || []
    });
  } catch (error) {
    console.error('🔴 [CONVERSATION FETCH ERROR]:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch conversations'
    });
  }
};
