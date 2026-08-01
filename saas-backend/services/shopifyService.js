import axios from 'axios';

/**
 * Fetch Order details directly from Shopify Store
 */
export const getShopifyOrderDetails = async (shopifyDomain, accessToken, orderId) => {
  try {
    const response = await axios.get(
      `https://${shopifyDomain}/admin/api/2026-01/orders/${orderId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data.order;
  } catch (error) {
    console.error('🔴 [SHOPIFY SERVICE ERROR]:', error.message);
    return null;
  }
};
