onst supabase = require('../config/supabase');

// Get Bot Config for logged-in user
exports.getBotConfig = async (req, res) => {
  try {
    const userId = req.user.id; // Comes from authMiddleware

    const { data, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    // If no config found, return default fallback structure
    if (!data) {
      return res.status(200).json({
        success: true,
        isConfigured: false,
        config: {
          llm_provider: 'Groq Cloud',
          model_name: 'llama-3.1-8b-instant',
          api_key: '',
          system_prompt: 'Use this product inventory dataset as the primary ground-truth knowledge base to reply to customer pricing and detail queries via Groq.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      isConfigured: true,
      config: data
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Save or Update Bot Config
exports.saveBotConfig = async (req, res) => {
  try {
    const userId = req.user.id;
    const { llm_provider, model_name, api_key, system_prompt } = req.body;

    if (!system_prompt) {
      return res.status(400).json({ success: false, message: 'System prompt is required' });
    }

    const { data, error } = await supabase
      .from('bot_configs')
      .upsert({
        user_id: userId,
        llm_provider: llm_provider || 'Groq Cloud',
        model_name: model_name || 'llama-3.1-8b-instant',
        api_key: api_key || null,
        system_prompt: system_prompt,
        updated_at: new Date()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Bot Configuration saved successfully!',
      config: data
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
