import axios from 'axios';
import { supabase } from '../config/supabase.js';

/**
 * Exchange Shopify OAuth Code for Permanent Access Token
 */
export const handleShopifyOAuthExchange = async (shop, code, storeId) => {
  try {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = response.data.access_token;

    // Save Shopify integration token to Supabase
    await supabase.from('integrations').upsert({
      store_id: storeId,
      platform: 'shopify',
      shop_domain: shop,
      access_token: accessToken,
      is_active: true
    }, { onConflict: 'shop_domain' });

    return { success: true, shop };
  } catch (error) {
    console.error('[SHOPIFY OAUTH ERROR]:', error?.response?.data || error.message);
    throw new Error('Failed to exchange Shopify access token');
  }
};

/**
 * Sync Products & Inventory from Shopify
 */
export const getShopifyProducts = async (shopDomain, accessToken) => {
  try {
    const response = await axios.get(`https://${shopDomain}/admin/api/2024-01/products.json`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    return response.data.products.map(p => ({
      id: p.id,
      title: p.title,
      price: p.variants[0]?.price,
      inventory: p.variants[0]?.inventory_quantity
    }));
  } catch (error) {
    console.error('[SHOPIFY FETCH PRODUCTS ERROR]:', error?.response?.data || error.message);
    return [];
  }
};

/**
 * Create Draft/Confirmed Order directly in Shopify Store
 */
export const createShopifyOrder = async (shopDomain, accessToken, orderData) => {
  try {
    const payload = {
      order: {
        line_items: orderData.products.map(p => ({
          title: p.name,
          quantity: p.quantity,
          price: p.price
        })),
        customer: {
          first_name: orderData.customerName,
          phone: orderData.phone
        },
        shipping_address: {
          address1: orderData.address
        },
        financial_status: 'pending'
      }
    };

    const response = await axios.post(
      `https://${shopDomain}/admin/api/2024-01/orders.json`,
      payload,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.order;
  } catch (error) {
    console.error('[SHOPIFY CREATE ORDER ERROR]:', error?.response?.data || error.message);
    throw error;
  }
};
