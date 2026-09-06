const supabase = require('../config/supabase');

// 1. Get Bot Config for logged-in user
exports.getBotConfig = async (req, res) => {
  try {
    const orgId = req.user?.org_id || req.user?.id;

    const { data, error } = await supabase
      .from('bot_configs')
      .select('*')
      .eq('org_id', orgId)
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
          system_prompt: 'Use this product inventory dataset as the primary ground-truth knowledge base to reply to customer questions accurately and concisely.',
          order_capture_fields: [
            { id: "customer_name", label: "Customer Name", required: true },
            { id: "phone_number", label: "Phone Number", required: true },
            { id: "delivery_address", label: "Delivery Address", required: false },
            { id: "product_quantity", label: "Product Quantity", required: false }
          ]
        }
      });
    }

    return res.status(200).json({
      success: true,
      isConfigured: true,
      config: data
    });
  } catch (error) {
    console.error('[GET BOT CONFIG ERROR]:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 2. Save or Update Bot Config
exports.saveBotConfig = async (req, res) => {
  try {
    const orgId = req.user?.org_id || req.user?.id;
    console.log("Frontend Theke Asa Data:", req.body);

    const {
      provider,
      llm_provider,
      model,
      model_name,
      api_key,
      system_prompt,
      order_capture_fields
    } = req.body;

    if (!system_prompt) {
      return res.status(400).json({ success: false, message: "System prompt is required" });
    }

    const { data, error } = await supabase
      .from('bot_configs')
      .upsert({
        org_id: orgId,
        llm_provider: provider || llm_provider || "Groq Cloud",
        model_name: model || model_name || "llama-3.1-8b-instant",
        api_key: api_key ? api_key.trim() : null,
        system_prompt: system_prompt,
        order_capture_fields: Array.isArray(order_capture_fields) ? order_capture_fields : [],
        updated_at: new Date().toISOString()
      }, { onConflict: 'org_id' })
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'Bot Configuration saved successfully!',
      config: data
    });
  } catch (error) {
    console.error('[SAVE BOT CONFIG ERROR]:', error.message);
    return res.status(500).json({ success: false, message: error.message });
  }
};