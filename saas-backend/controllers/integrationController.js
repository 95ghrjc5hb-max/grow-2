import supabase from '../config/supabase.js';

// 1. Get all integrations for logged in organization/workspace
export const getIntegrations = async (req, res) => {
  try {
    const orgId = req.user?.org_id; 
    
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId);

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

// 2. Connect WhatsApp integration
export const connectWhatsApp = async (req, res) => {
  try {
    const orgId = req.user?.org_id;
    const { phoneNumber, apiKey } = req.body;

    const { data, error } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        platform: 'whatsapp',
        status: 'connected',
        credentials: { phoneNumber, apiKey },
        updated_at: new Date()
      }, { onConflict: 'org_id, platform' });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: "WhatsApp connected successfully!",
      data
    });
  } catch (error) {
    console.error('[WHATSAPP CONNECT ERROR]:', error.message);
    return res.status(500).json({ error: error.message || "Failed to connect WhatsApp." });
  }
};

// 3. Disconnect integration
export const disconnectIntegration = async (req, res) => {
  try {
    const { platform } = req.body;
    const orgId = req.user?.org_id;

    if (!platform) {
      return res.status(400).json({ error: "Platform name is required" });
    }

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('org_id', orgId)
      .eq('platform', platform);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: `${platform} integration disconnected successfully.`
    });
  } catch (error) {
    console.error('[DISCONNECT INTEGRATION ERROR]:', error.message);
    return res.status(500).json({ error: "Failed to disconnect integration." });
  }
};
