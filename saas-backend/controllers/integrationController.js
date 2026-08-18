import axios from 'axios';
import { supabase } from '../config/supabase.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';

// 1. Get all integrations for logged in organization/workspace
export const getIntegrations = async (req, res) => {
  try {
    const orgId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.org_id;
    if (!orgId) return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });

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

// 2. 1-Click WhatsApp Embedded Signup OAuth Callback
export const connectWhatsAppOAuth = async (req, res) => {
  try {
    const orgId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.org_id;
    if (!orgId) return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });

    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Missing token or code from Meta.' });

    let userAccessToken = code;

    // If code is an authorization code (not a direct access token), exchange it
    if (!code.startsWith('EAA')) {
      const tokenResponse = await axios.get(`${GRAPH_API_URL}/oauth/access_token`, {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          code: code
        }
      });
      userAccessToken = tokenResponse.data.access_token;
    }

    // Retrieve shared WABA ID
    let wabaId = null;
    try {
      const debugResponse = await axios.get(`${GRAPH_API_URL}/debug_token`, {
        params: {
          input_token: userAccessToken,
          access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
        }
      });
      const granularScopes = debugResponse.data?.data?.granular_scopes || [];
      const wabaScope = granularScopes.find((s) => s.scope === 'whatsapp_business_management');
      wabaId = wabaScope?.target_ids?.[0] || null;
    } catch (dbgErr) {
      console.warn('[DEBUG TOKEN WARNING]:', dbgErr.message);
    }

    // Fetch Phone Number ID under this WABA
    let phoneData = null;
    if (wabaId) {
      try {
        const phoneRes = await axios.get(`${GRAPH_API_URL}/${wabaId}/phone_numbers`, {
          headers: { Authorization: `Bearer ${userAccessToken}` }
        });
        phoneData = phoneRes.data?.data?.[0] || null;
      } catch (phoneErr) {
        console.warn('[FETCH PHONE NUMBERS WARNING]:', phoneErr.message);
      }
    }

    // Auto-subscribe WABA to our Webhook
    if (wabaId) {
      try {
        await axios.post(
          `${GRAPH_API_URL}/${wabaId}/subscribed_apps`,
          {},
          { headers: { Authorization: `Bearer ${userAccessToken}` } }
        );
        console.log(`[WABA AUTO-SUBSCRIBED]: WABA ${wabaId} subscribed!`);
      } catch (subErr) {
        console.warn('[WABA SUBSCRIBE WARNING]:', subErr?.response?.data || subErr.message);
      }
    }

    // Save into Supabase integrations table
    const { data, error } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        platform: 'whatsapp',
        page_id: phoneData?.id || wabaId || 'whatsapp_connected',
        access_token: userAccessToken,
        status: 'connected',
        is_connected: true,
        updated_at: new Date()
      }, { onConflict: 'org_id, platform' });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'WhatsApp Business connected successfully!',
      data
    });
  } catch (error) {
    console.error('[WHATSAPP OAUTH ERROR]:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error?.response?.data?.error?.message || error.message || 'Failed to connect WhatsApp'
    });
  }
};

// 3. Connect WhatsApp integration (Manual fallback)
export const connectWhatsApp = async (req, res) => {
  try {
    const orgId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.org_id;
    if (!orgId) return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });
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
      message: 'WhatsApp connected successfully!',
      data
    });
  } catch (error) {
    console.error('[WHATSAPP CONNECT ERROR]:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to connect WhatsApp.' });
  }
};

// 4. Disconnect integration
export const disconnectIntegration = async (req, res) => {
  try {
    const { platform } = req.params;
    const orgId = req.user?.id || req.user?.userId || req.user?.sub || req.user?.org_id;
    if (!orgId) return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });

    if (!platform) {
      return res.status(400).json({ error: 'Platform name is required' });
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
    return res.status(500).json({ error: 'Failed to disconnect integration.' });
  }
};