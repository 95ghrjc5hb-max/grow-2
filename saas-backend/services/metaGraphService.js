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

/**
 * Send Message to Messenger or Instagram via Meta Graph API
 */
export const sendMetaReply = async (pageAccessToken, recipientId, messageText) => {
  try {
    const response = await axios.post(
      `${GRAPH_API_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: messageText },
        messaging_type: 'RESPONSE'
      },
      {
        params: { access_token: pageAccessToken }
      }
    );
    return response.data;
  } catch (error) {
    console.error('[META SEND MESSAGE ERROR]:', error?.response?.data || error.message);
    throw error;
  }
};
