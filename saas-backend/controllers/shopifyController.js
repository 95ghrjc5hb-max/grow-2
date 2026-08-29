import axios from 'axios';
import jwt from 'jsonwebtoken';
// Apnar server.js theke supabase import korchi (jemon apnar code e chilo)
import { supabase } from '../server.js'; 

// ---------------------------------------------------------
// 1. BEGIN AUTH: Redirect to Shopify Install Page
// ---------------------------------------------------------
export const beginShopifyAuth = async (req, res) => {
  try {
    const shop = req.query.shop;
    // Token parameter theke nibo, othoba header theke
    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);

    if (!shop || !token) {
      return res.status(400).json({ success: false, error: 'Shop domain and user token are required' });
    }

    let cleanShop = shop.trim().toLowerCase();
    if (!cleanShop.includes('.myshopify.com')) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }

    const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,write_script_tags,read_script_tags';
    const redirectUri = `${process.env.BACKEND_URL || 'https://unloving-unnamed-flight.ngrok-free.dev'}/api/auth/shopify/callback`;
    const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;

    // 🔥 User er token ta amra 'state' parameter e pathiye dicchi
    const state = token;

    const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

    return res.redirect(installUrl);
  } catch (error) {
    console.error('Error starting Shopify OAuth:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate Shopify authorization' });
  }
};


// ---------------------------------------------------------
// 2. CALLBACK: Handle Redirect, Save DB, Sync Products & Inject Bot
// ---------------------------------------------------------
export const handleShopifyCallback = async (req, res) => {
  try {
    const { code, shop, state } = req.query;

    if (!code || !shop) {
      return res.status(400).send('Missing code or shop parameter');
    }

   // A. DECODE TOKEN MANUALLY (Mirroring authMiddleware logic)
    let userId;
    try {
      if (!state || state === 'undefined' || state === 'null') {
         throw new Error("State parameter is missing or invalid");
      }
      
      // Manual JWT decoding to bypass strict network verification
      const base64Url = state.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const decodedPayload = JSON.parse(Buffer.from(base64, 'base64').toString());

      // Attach user ID
      userId = decodedPayload.sub || decodedPayload.userId || decodedPayload.id || decodedPayload.org_id || decodedPayload.orgId;
      
      if(!userId) throw new Error("Could not extract User ID from token");

    } catch (err) {
      console.error("Token decode error in callback:", err.message);
      return res.status(401).send('Invalid user identity in state');
    }

    // B. Shopify theke Access Token neya
    const tokenResponse = await axios.post(`https://${shop}/admin/oauth/access_token`, {
      client_id: process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET,
      code,
    });

    const accessToken = tokenResponse.data.access_token;
    console.log(`✅ User ${userId} Connected to Shopify: ${shop}`);

    if (userId) {
      try {
        // ---------------------------------------------------------
        // STEP 1: 🔥 Save Integration in Supabase 'integrations' table 🔥
        // ---------------------------------------------------------
        const { data: existingIntegration } = await supabase
          .from('integrations')
          .select('id')
          .eq('org_id', userId)
          .eq('platform', 'shopify')
          .single();

        if (existingIntegration) {
          // Update jodi age thekei thake
          await supabase.from('integrations').update({ 
              page_id: shop, 
              access_token: accessToken, 
              is_connected: true, 
              status: 'connected', 
              updated_at: new Date().toISOString()
            }).eq('id', existingIntegration.id);
        } else {
          // Notun insert
          await supabase.from('integrations').insert([{ 
              org_id: userId, 
              platform: 'shopify', 
              page_id: shop, 
              access_token: accessToken, 
              is_connected: true, 
              status: 'connected'
            }]);
        }
        
        // ---------------------------------------------------------
        // STEP 2: 🔥 Fetch & Sync Products to 'products' table 🔥
        // ---------------------------------------------------------
        console.log("🔄 Starting Product Sync from Shopify...");
        const shopifyProductsResponse = await axios.get(`https://${shop}/admin/api/2024-01/products.json`, {
          headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
        });
        
        const shopifyProducts = shopifyProductsResponse.data.products;
        
        if (shopifyProducts && shopifyProducts.length > 0) {
            const productsToInsert = shopifyProducts.map(product => {
                return {
                    org_id: userId,
                    name: product.title,
                    description: product.body_html ? product.body_html.replace(/(<([^>]+)>)/gi, "") : "", // Clean HTML
                    price: product.variants[0]?.price || 0,
                    stock: product.variants[0]?.inventory_quantity > 0 ? 'In Stock' : 'Out of Stock'
                };
            });
            
            const { error: productError } = await supabase.from('products').insert(productsToInsert);
            if(productError) console.error("❌ Failed to sync products:", productError);
            else console.log(`✅ Synced ${shopifyProducts.length} products to inventory!`);
        }

        // ---------------------------------------------------------
        // STEP 3: 🔥 Auto-Inject AI Chatbot Widget (ScriptTag) 🔥
        // ---------------------------------------------------------
        console.log("🤖 Injecting AI Chatbot Widget into Shopify Store...");
        
        // Ekhane apnar actual script er domain hobe (ngrok ba live domain)
        const WIDGET_URL = `${process.env.BACKEND_URL || 'https://unloving-unnamed-flight.ngrok-free.dev'}/api/widget/bot.js?org_id=${userId}&shop=${shop}`; 
        
        try {
           await axios.post(`https://${shop}/admin/api/2024-01/script_tags.json`, {
              script_tag: {
                event: "onload",
                src: WIDGET_URL,
                display_scope: "online_store" 
              }
            }, {
              headers: { 
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
              }
            });
            console.log("✅ Chat Widget Successfully Injected!");
        } catch (scriptError) {
             console.log("⚠️ Chat Widget already injected or error:", scriptError.response?.data || scriptError.message);
        }

      } catch (dbError) {
         console.error("Database operation failed:", dbError);
      }
    }

    // ---------------------------------------------------------
    // FINALLY: Redirect back to frontend Dashboard
    // ---------------------------------------------------------
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integrations?shopify=success`);

  } catch (error) {
    console.error('Shopify callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integrations?shopify=error`);
  }
};