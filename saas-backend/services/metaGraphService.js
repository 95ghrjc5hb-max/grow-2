import axios from 'axios';

/**
 * Send Message via Meta Graph API (Messenger / Instagram DM)
 */
export const sendMessageToMeta = async ({ recipientId, textMessage, accessToken }) => {
  try {
    const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`;
    
    const response = await axios.post(url, {
      recipient: { id: recipientId },
      message: { text: textMessage }
    });

    return { success: true, data: response.data };
  } catch (error) {
    console.error('🔴 [META GRAPH ERROR]:', error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};
