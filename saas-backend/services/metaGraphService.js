import axios from 'axios';
import { supabase } from '../config/supabase.js';

const GRAPH_API_URL = "https://graph.facebook.com/v18.0";

/**
 * Exchange Meta OAuth Code for a Long-Lived Access Token and Save Page Credentials
 */
export const exchangeMetaCode = async (code, storeId) => {
  try {
    // 1. Exchange authorization code for short-lived user access token
    const tokenResponse = await axios.get(`${GRAPH_API_URL}/oauth/access_token`, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: process.env.META_REDIRECT_URI,
        code
      }
    });

    const shortLivedToken = tokenResponse.data.access_token;

    // 2. Exchange short-lived token for long-lived user token (60-day validity)
    const longLivedResponse = await axios.get(`${GRAPH_API_URL}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortLivedToken
      }
    });

    const longLivedToken = longLivedResponse.data.access_token;

    // 3. Fetch connected Facebook Pages & Instagram Business Accounts
    const pagesResponse = await axios.get(`${GRAPH_API_URL}/me/accounts`, {
      params: {
        access_token: longLivedToken,
        fields: 'id,name,access_token,instagram_business_account'
      }
    });

    const pages = pagesResponse.data.data;

    // 4. Save Page & Token details into Supabase DB
    for (const page of pages) {
      await supabase.from('integrations').upsert({
        store_id: storeId,
        platform: 'meta',
        page_id: page.id,
        page_name: page.name,
        access_token: page.access_token, // Permanent Page Token
        instagram_id: page.instagram_business_account?.id || null,
        is_active: true
      }, { onConflict: 'page_id' });
    }

    return { success: true, count: pages.length };
  } catch (error) {
    console.error('[META OAUTH ERROR]:', error?.response?.data || error.message);
    throw new Error('Failed to complete Meta authentication');
  }
};
// Send Message to Messenger or Instagram via Meta Graph API
export const sendMetaReply = async (pageAccessToken, pageId, recipientId, messageText) => {
  try {
    const url = `${GRAPH_API_URL}/me/messages`;

    const payload = {
      recipient: { id: recipientId },
      message: { text: messageText }
    };

    const response = await axios.post(url, payload, {
      params: { access_token: pageAccessToken }
    });

    console.log('[META GRAPH API SUCCESS]:', response.data);
    return response.data;
  } catch (error) {
    console.error('[META GRAPH API ERROR]:', error?.response?.data || error.message);
    throw error;
  }
};
// Automatically subscribe Facebook Page & Instagram to Webhook events
export const subscribeAppToPage = async (pageAccessToken, pageId) => {
  try {
    const response = await axios.post(
      `${GRAPH_API_URL}/${pageId}/subscribed_apps`,
      {},
      {
        params: {
          subscribed_fields: 'messages,messaging_postbacks,message_reactions',
          access_token: pageAccessToken
        }
      }
    );
    console.log(`[META SUBSCRIBED SUCCESS]: Page ${pageId} subscribed to webhooks!`, response.data);
  } catch (error) {
    console.error('[META SUBSCRIBED ERROR]:', error?.response?.data || error.message);
  }
};
// Send WhatsApp Message via Meta Cloud API
export const sendWhatsAppReply = async (accessToken, phoneNumberId, recipientPhone, messageText) => {
  try {
    const url = `${GRAPH_API_URL}/${phoneNumberId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipientPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: messageText
      }
    };

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('[WHATSAPP API SUCCESS]:', response.data);
    return response.data;
  } catch (error) {
    console.error('[WHATSAPP API ERROR]:', error?.response?.data || error.message);
    throw error;
  }
};