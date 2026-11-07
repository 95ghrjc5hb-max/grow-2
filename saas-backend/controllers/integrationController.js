import axios from 'axios';
import { supabase } from '../config/supabase.js';

const GRAPH_API_URL = 'https://graph.facebook.com/v18.0';
// Helper function to safely fetch the real org_id
const getRealOrgId = async (userId) => {
  let { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.org_id) return profile.org_id;

  const { data: member } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle();

  return member?.org_id || userId;
};
export const getIntegrations = async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;

    if (!orgId) {
      return res.status(200).json({
        success: true,
        data: [],
        integrations: []
      });
    }

    // Fetch all integrations strictly by org_id
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: integrations || [],
      integrations: integrations || []
    });

  } catch (error) {
    console.error('[GET INTEGRATIONS ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// 2. 1-Click WhatsApp Embedded Signup OAuth Callback (Production Enterprise Grade)
export const connectWhatsAppOAuth = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });

    const orgId = await getRealOrgId(userId);
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Missing token or code from Meta.' });

    let userAccessToken = code;

    // ১. কোড যদি Authorization Code হয়, তবে Access Token এক্সচেঞ্জ করা
    if (!code.startsWith('EAA')) {
      const tokenResponse = await axios.get(`${GRAPH_API_URL}/oauth/access_token`, {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          code: code,
        }
      });
      userAccessToken = tokenResponse.data.access_token;
    }

    // ২. WABA ID সংগ্রহ (Debug Token)
    let wabaId = null;
    try {
      const debugResponse = await axios.get(`${GRAPH_API_URL}/debug_token`, {
        params: {
          input_token: userAccessToken,
          access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`
        }
      });
      const granularScopes = debugResponse.data?.data?.granular_scopes || [];
      const wabaScope = granularScopes.find(s => s.scope === 'whatsapp_business_management');
      wabaId = wabaScope?.target_ids?.[0];
    } catch (dbgErr) {
      console.warn('[DEBUG TOKEN WARNING]:', dbgErr.response?.data || dbgErr.message);
    }

    // ৩. WABA-র অধীনে ফোন নাম্বারের মেটাডেটা সংগ্রহ
    let phoneData = null;
    if (wabaId) {
      try {
        const phoneRes = await axios.get(`${GRAPH_API_URL}/${wabaId}/phone_numbers`, {
          headers: { Authorization: `Bearer ${userAccessToken}` }
        });
        phoneData = phoneRes.data?.data?.[0];
      } catch (phoneErr) {
        console.warn('[FETCH PHONE NUMBERS WARNING]:', phoneErr.response?.data || phoneErr.message);
      }
    }

    const phoneNumberId = phoneData?.id || wabaId;

    // ৪. ক্লাউড এপিআইতে অটো-রেজিস্ট্রেশন (Pending স্ট্যাটাস দূর করে সাথে সাথে CONNECTED করবে)
    if (phoneData?.id) {
      try {
        await axios.post(
          `${GRAPH_API_URL}/${phoneData.id}/register`,
          {
            messaging_product: 'whatsapp',
            pin: '123456' // মেটা ক্লাউড এপিআইয়ের জন্য ডিফল্ট রেজিস্ট্রেশন পিন
          },
          {
            headers: { Authorization: `Bearer ${userAccessToken}` }
          }
        );
        console.log(`[META ONBOARD SUCCESS] Phone ID ${phoneData.id} auto-registered & activated!`);
      } catch (regErr) {
        console.warn('[PHONE REGISTER WARNING]:', regErr.response?.data?.error?.message || regErr.message);
      }
    }

    // ৫. অটো-সাবস্ক্রিপশন (Grow Webhook এ ইনকামিং মেসেজ চালু করা)
    if (wabaId) {
      try {
        await axios.post(
          `${GRAPH_API_URL}/${wabaId}/subscribed_apps`,
          {},
          { headers: { Authorization: `Bearer ${userAccessToken}` } }
        );
        console.log(`[WABA AUTO-SUBSCRIBED]: WABA ${wabaId} subscribed!`);
      } catch (subErr) {
        console.warn('[WABA SUBSCRIBE WARNING]:', subErr.response?.data || subErr.message);
      }
    }

    // ৬. সুপাবেস integrations টেবিলে সেভ
    const { data, error } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        platform: 'whatsapp',
        page_id: phoneNumberId, // স্ট্রিক্ট ওয়েববুক হুবহু এই আইডি খুঁজবে
        access_token: userAccessToken,
        status: 'connected',
        is_connected: true,
        credentials: {
          wabaId,
          phoneNumberId: phoneData?.id,
          displayPhoneNumber: phoneData?.display_phone_number
        },
        updated_at: new Date()
      }, { onConflict: 'org_id, platform' });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'WhatsApp Business connected and activated successfully!',
      data
    });
  } catch (error) {
    console.error('[WHATSAPP OAUTH ERROR]:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Failed to connect WhatsApp'
    });
  }
};

// 3. Connect WhatsApp integration (Manual fallback)
export const connectWhatsApp = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized: User ID missing" });
    
    const orgId = await getRealOrgId(userId);
const { phoneNumber, apiKey, phoneNumberId } = req.body;
    const { data, error } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        platform: 'whatsapp',
        page_id: phoneNumberId || phoneNumber, // এটি নিশ্চিত করে incoming webhook সরাসরি tenant-কে চিনবে
        status: 'connected',
        is_connected: true,
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
    const userId = req.user?.id || req.user?.userId || req.user?.sub;

    if (!userId) {
        return res.status(401).json({ success: false, error: 'Unauthorized: User ID missing' });
    }
    if (!platform) {
        return res.status(400).json({ error: 'Platform name is required' });
    }

    // Fetch the CORRECT org_id from profiles based on user ID
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile?.org_id) {
        return res.status(404).json({ success: false, error: 'Organization not found for user' });
    }

    const { error } = await supabase
      .from('integrations')
      .delete()
      .eq('org_id', profile.org_id)
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