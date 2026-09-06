import axios from 'axios';
import { supabase } from '../config/supabase.js';

// 1. Exchange Shopify OAuth Code for Permanent Access Token
export const handleShopifyOAuthExchange = async (shop, code, orgId) => {
  try {
    const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code
    });

    const accessToken = response.data.access_token;

    // Save Shopify integration to Supabase using uniform org_id
    await supabase.from('integrations').upsert({
      org_id: orgId,
      platform: 'shopify',
      metadata: {
        shop_domain: shop,
        access_token: accessToken
      },
      status: 'connected',
      updated_at: new Date().toISOString()
    }, { onConflict: 'org_id, platform' });

    return { success: true, shop };
  } catch (error) {
    console.error('[SHOPIFY OAUTH ERROR]:', error.response?.data || error.message);
    throw new Error('Failed to exchange Shopify access token');
  }
};

// 2. Sync Products from Shopify directly into GROW Inventory Table
export const getShopifyProducts = async (shopDomain, accessToken, orgId) => {
  try {
   axios.get(`https://${shopDomain}/admin/api/2026-07/products.json?limit=250`, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    const rawProducts = response.data.products || [];
    const savedProducts = [];

    for (const p of rawProducts) {
      const primaryVariant = p.variants?.[0] || {};
      const primaryImage = p.images?.[0]?.src || null;
      const cleanDescription = (p.body_html || '').replace(/<[^>]*>?/gm, '').trim();

      const productPayload = {
            org_id: orgId,
            name: p.title,
            price: parseFloat(primaryVariant.price || 0),
            stock_status: primaryVariant.inventory_quantity > 0 ? 'in_stock' : 'out_of_stock',
            description: cleanDescription || p.title,
            image_url: primaryImage,
            shopify_product_id: String(p.id),
            updated_at: new Date().toISOString()
        };

      // Direct Upsert into GROW Products Inventory
      const { data, error } = await supabase
        .from('products')
        .upsert(productPayload, { onConflict: 'org_id, shopify_product_id' })
        .select()
        .single();

      if (!error && data) {
        savedProducts.push(data);
      }
    }

    return savedProducts;
  } catch (error) {
    console.error('[SHOPIFY FETCH PRODUCTS ERROR]:', error.response?.data || error.message);
    return [];
  }
};

// 3. Create Draft/Confirmed Order safely in Shopify Store
export const createShopifyOrder = async (shopDomain, accessToken, orderData) => {
  try {
    // 🛡️ Array / String Parsing Guardrail: prevents .map() crashes
    let lineItems = [];

    if (Array.isArray(orderData.products)) {
      lineItems = orderData.products.map(p => ({
        title: p.name || p.title || 'Custom Product',
        quantity: parseInt(p.quantity, 10) || 1,
        price: String(p.price || orderData.totalPrice || '0.00')
      }));
    } else {
      lineItems = [{
        title: typeof orderData.products === 'string' ? orderData.products : 'AI Chat Order',
        quantity: parseInt(orderData.product_quantity, 10) || 1,
        price: String(orderData.totalPrice || orderData.total_amount || '0.00')
      }];
    }

    const payload = {
      order: {
        line_items: lineItems,
        customer: {
          first_name: orderData.customer_name || orderData.customerName || 'Valued Customer',
          phone: orderData.phone_number || orderData.phone || undefined
        },
        shipping_address: {
          address1: orderData.delivery_address || orderData.address || 'Address provided in chat'
        },
        financial_status: 'pending'
      }
    };

    const response = await axios.post(
     `https://${shopDomain}/admin/api/2026-07/orders.json`,
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
    console.error('[SHOPIFY CREATE ORDER ERROR]:', error.response?.data || error.message);
    return null; // Won't crash whole backend if shopify sync fails
  }
};
// 4. Create Recurring App Subscription via GraphQL
export const createShopifySubscription = async (shopDomain, accessToken, planName, price, returnUrl) => {
  const query = `
    mutation AppSubscriptionCreate($name: String!, $returnUrl: URL!, $price: Decimal!, $test: Boolean) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        test: $test
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $price, currencyCode: USD }
                interval: EVERY_30_DAYS
              }
            }
          }
        ]
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          status
        }
      }
    }
  `;

  const variables = {
    name: planName,
    returnUrl: returnUrl,
    price: Number(price).toFixed(2),
    test: true // Live পেমেন্টের সময় false করবেন
  };

  const response = await axios.post(
    `https://${shopDomain}/admin/api/2024-10/graphql.json`,
    { query, variables },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken
      }
    }
  );

  const resData = response.data?.data?.appSubscriptionCreate;

  if (resData?.userErrors?.length > 0) {
    throw new Error(resData.userErrors[0].message);
  }

  return resData?.confirmationUrl;
};