import axios from 'axios';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';
import { handleCustomerMessage } from '../services/aiAgentService.js';
import { generateEmbedding, buildProductEmbeddingText } from '../services/ragService.js';
import { checkAndIncrementShopifyUsage } from "../services/usageService.js";
import * as shopifyService from "../services/shopifyService.js";
// 1. BEGIN AUTH: Redirect to Shopify OAuth (User Logged In from Dashboard)
export const beginShopifyAuth = async (req, res) => {
  try {
    const shop = req.query.shop;
    const token = req.query.token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null);

    if (!shop || !token) {
      return res.status(400).json({ success: false, error: 'Shop domain and user token are required' });
    }

    // Sanitize shop domain properly
    let cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '').trim().toLowerCase();
    if (!cleanShop.includes('.myshopify.com')) {
      cleanShop = `${cleanShop}.myshopify.com`;
    }

    // In beginShopifyAuth:
    const scopes = process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_orders,write_orders';
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
    const redirectUri = `${backendUrl}/api/v1/shopify/callback`;
    const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;

    // Pass user token in state
    const state = token;
    const installUrl = `https://${cleanShop}/admin/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&grant_options[]=per-user`;

    return res.redirect(installUrl);
  } catch (error) {
    console.error('[shopifyController] Error starting OAuth:', error);
    return res.status(500).json({ success: false, error: 'Failed to initiate Shopify authorization' });
  }
};

// 2. CALLBACK: Store Integration & Auto-Generate Product Embeddings
export const handleShopifyCallback = async (req, res) => {
  try {
    const { code, shop, state } = req.query;

    if (!code || !shop) {
      return res.status(400).send('Missing code or shop parameter');
    }

    const cleanShopDomain = shop.replace(/^https?:\/\//, '').replace(/\/$/, '').trim().toLowerCase();

    // Step A: Extract authenticated user from state token
    let userId;
    try {
      const base64Url = state.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const decodedPayload = JSON.parse(Buffer.from(base64, 'base64').toString());
      userId = decodedPayload.sub || decodedPayload.user_id || decodedPayload.id;
      if (!userId) throw new Error('Could not resolve user identity from state');
    } catch (err) {
      console.error('[shopifyController] State token decode error:', err.message);
      return res.status(401).send('Invalid user identity state');
    }

    // Step B: Resolve the user's primary organization ID
    const { data: memberRecord } = await supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', userId)
      .maybeSingle();

    const targetOrgId = memberRecord?.org_id || userId;
// Step C: Exchange code with Shopify for access token
    const clientId = process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET;

    const tokenResponse = await axios.post(`https://${cleanShopDomain}/admin/oauth/access_token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code
    });
    
    let accessToken = tokenResponse.data.access_token;
console.log('[shopifyController] Access Token acquired successfully:', accessToken);

    // Step D: Upsert into integrations table (Safe Check)
    const { data: existingInteg } = await supabase
      .from('integrations')
      .select('id')
      .eq('org_id', targetOrgId)
      .eq('platform', 'shopify')
      .maybeSingle();

    const integrationPayload = {
      org_id: targetOrgId,
      platform: 'shopify',
      page_id: cleanShopDomain,
      access_token: accessToken,
      is_connected: true,
      status: 'connected',
      updated_at: new Date().toISOString(),
    };

    let integError;
    if (existingInteg) {
      const { error } = await supabase
        .from('integrations')
        .update(integrationPayload)
        .eq('id', existingInteg.id);
      integError = error;
    } else {
      const { error } = await supabase
        .from('integrations')
        .insert(integrationPayload);
      integError = error;
    }

    if (integError) {
      console.error('[shopifyController] Supabase Integration Save Error:', integError);
    } else {
      console.log(`[shopifyController] Store connected & saved to DB: ${cleanShopDomain} -> Org: ${targetOrgId}`);
    }

    // Step E: Fetch all Shopify products & AUTOMATICALLY generate Embeddings
    (async () => {
      try {
        console.log(`[shopifyController] Starting auto product sync for ${cleanShopDomain}...`);
       const productsRes = await axios.get(`https://${cleanShopDomain}/admin/api/2026-07/products.json`, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        });

        const shopifyProducts = productsRes.data.products || [];
        console.log(`[shopifyController] Fetched ${shopifyProducts.length} products. Generating embeddings...`);

        for (const sp of shopifyProducts) {
         const productData = {
                org_id: targetOrgId,
                name: sp.title,
                description: sp.body_html ? sp.body_html.replace(/<[^>]*>?/gm, '').trim() : '',
                price: Number(sp.variants?.[0]?.price) || 0,
                image_url: sp.images?.[0]?.src || null,
                stock_status: (sp.variants?.[0]?.inventory_quantity ?? 1) > 0 ? 'in_stock' : 'out_of_stock',
                shopify_product_id: String(sp.id)
            };

          const textToEmbed = buildProductEmbeddingText(productData);
          const embedding = await generateEmbedding(textToEmbed);

          await supabase.from('products').upsert({
            ...productData,
            embedding: embedding ? embedding : null,
          }, { onConflict: 'org_id,shopify_product_id' });
        }

        console.log(`[shopifyController] Auto-sync & Embeddings completed for ${shopifyProducts.length} items`);
      } catch (syncErr) {
        console.error('[shopifyController] Background product sync error:', syncErr.response?.data || syncErr.message);
      }
    })();

    // Step F: Register Webhooks for Real-Time Sync
    const webhookTopics = ['products/create', 'products/update', 'products/delete'];
    const backendUrl = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

    for (const topic of webhookTopics) {
      try {
       await axios.post(`https://${cleanShopDomain}/admin/api/2026-07/webhooks.json`, {
          webhook: {
            topic: topic,
            address: `${backendUrl}/api/v1/shopify/webhook`,
            format: 'json',
          },
        }, {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        });
        console.log(`[shopifyController] Webhook registered successfully: ${topic}`);
      } catch (webhookErr) {
        console.warn(`[shopifyController] Webhook ${topic} registration skipped/failed:`, webhookErr.response?.data || webhookErr.message);
      }
    }

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/integrations?shopify=success`);
  } catch (error) {
    console.error('[shopifyController] Callback Fatal Error:', error);
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    return res.redirect(`${frontendUrl}/integrations?shopify=error`);
  }
};

// 3. STOREFRONT CHAT: 100% Dynamic Tenant Resolution + Unified Inbox Sync
export const handleStorefrontChat = async (req, res) => {
  try {
    const { 
      message, 
      shop, 
      org_id, 
      image, 
      audio, 
      session_id, 
      customer_name, 
      conversationHistory = [] 
    } = req.body;

    console.log('[shopifyController] Incoming chat from shop:', shop, 'raw org_id:', org_id);

    // FIX: Sanitize org_id so that string "undefined" or "null" is treated as null
    let targetOrgId = (org_id && org_id !== 'undefined' && org_id !== 'null') ? org_id : null;

    // A. Dynamic Org Resolution from Shopify Store Domain
    if (!targetOrgId && shop) {
      const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '').trim().toLowerCase();
      const baseDomain = cleanShop.replace('.myshopify.com', '');

      const { data: integ, error: integErr } = await supabase
        .from('integrations')
        .select('org_id')
        .eq('platform', 'shopify')
        .or(`page_id.eq.${cleanShop},page_id.like.%${baseDomain}%`)
        .maybeSingle();

      if (integ?.org_id) {
        targetOrgId = integ.org_id;
        console.log('[shopifyController] Successfully resolved Org ID from domain:', targetOrgId);
      }
    }

    // B. Dev/Preview Fallback: Auto-pick active shopify store if domain doesn't match
    if (!targetOrgId) {
      const { data: fallbackInteg } = await supabase
        .from('integrations')
        .select('org_id')
        .eq('platform', 'shopify')
        .limit(1)
        .maybeSingle();

      if (fallbackInteg?.org_id) {
        targetOrgId = fallbackInteg.org_id;
        console.log('[shopifyController] Using Fallback Org ID:', targetOrgId);
      }
    }

    if (!targetOrgId) {
      console.warn(`[shopifyController] Unregistered storefront request from shop: ${shop}`);
      return res.status(200).json({
        success: false,
        reply: "This store has not configured the AI Assistant yet. Please connect your store from the Grow Dashboard."
      });
    }

    // // B. Check & Increment Shopify Message Usage Limit
    const usage = await checkAndIncrementShopifyUsage(targetOrgId);
    if (!usage.allowed) {
      return res.status(200).json({
        success: true,
        reply: "This store has reached its AI message limit for the current billing cycle. Please upgrade your plan.",
        handover: true
      });
    }

    // // C. Unified Inbox Integration (Sync Visitor & Conversation)
    const visitorId = session_id || req.ip || `shopify_guest_${Date.now()}`;
    const displayName = customer_name || `Shopify Visitor (${visitorId.slice(-4)})`;

    let conv = null;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, ai_active')
      .eq('org_id', targetOrgId)
      .eq('customer_identifier', visitorId)
      .eq('channel', 'shopify')
      .maybeSingle();

    if (existingConv) {
      conv = existingConv;
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from('conversations')
        .insert({
          org_id: targetOrgId,
          customer_name: displayName,
          customer_identifier: visitorId,
          channel: 'shopify',
          last_message: message || 'Attachment',
          status: 'open',
          message_count: 0,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (convErr) {
        console.error('[shopifyController] Failed to create conversation in Supabase:', convErr);
      }
      conv = newConv;
    }

    // // Save Customer Incoming Message
    if (conv?.id) {
      await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: targetOrgId,            // <--- এই লাইনটি যোগ করুন
  sender: 'customer',
  content: message || '',
  image_url: image || null,
  created_at: new Date().toISOString()
})
    }

    // // Check if Human Agent Paused AI for this conversation
    if (conv && conv.ai_active === false) {
      console.log('[AI PAUSED] Bot is paused by human agent. Skipping bot reply.');
      return res.status(200).json({
        conversation_id: conv?.id,
        success: true,
        reply: null,
        handover: true
      });
    }

    // // Fetch Recent Chat History for Context (if not provided by widget)
    let finalHistory = conversationHistory;
    if ((!finalHistory || finalHistory.length === 0) && conv?.id) {
      const { data: dbHistory } = await supabase
        .from('messages')
        .select('sender, content')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(10);

      finalHistory = (dbHistory || []).reverse().map(m => ({
        direction: m.sender === 'customer' ? 'incoming' : 'outgoing',
        message: m.content
      }));
    }

    // // D. Delegate to AI Agent Service
    const aiResponse = await handleCustomerMessage({
      customerMessage: message,
      orgId: targetOrgId,
      conversationHistory: finalHistory,
      imageUrl: image || null,
      audioUrl: audio || null
    });

    const replyText = typeof aiResponse === 'string' ? aiResponse : (aiResponse?.reply || "Hello! How can I assist you today?");

    // // Save Bot Response to Unified Inbox
    if (conv?.id && replyText) {
      await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: targetOrgId,            // <--- এই লাইনটি যোগ করুন
  sender: 'bot',
  content: replyText,
  created_at: new Date().toISOString()
})

      await supabase
        .from('conversations')
        .update({
          last_message: replyText,
          updated_at: new Date().toISOString()
        })
        .eq('id', conv.id);
    }

  return res.status(200).json({
  success: true,
  reply: replyText,
  conversation_id: conv?.id, // <--- এই লাইনটি যোগ করুন
  orderData: aiResponse?.orderData || null,
  imageUrl: aiResponse?.imageUrl || null,
  handover: Boolean(aiResponse?.handover)
});
  } catch (error) {
    console.error('[shopifyController] handleStorefrontChat Fatal Error:', error);
    return res.status(200).json({
      success: false,
      reply: "We are currently experiencing technical difficulties. Please try again in a moment.",
      conversation_id: conv?.id    // <--- শুধু এই লাইনটি যোগ করুন
    });
  }
};
// =========================================================================
// 4. SHOPIFY WEBHOOK RECEIVER (REAL-TIME AUTO SYNC)
// =========================================================================
export const handleShopifyWebhook = async (req, res) => {
    // 1. Send 200 OK immediately to prevent Shopify from timing out
    res.status(200).send('Webhook Received');

    try {
        const topic = req.headers['x-shopify-topic'];
        const shop = req.headers['x-shopify-shop-domain'];
        const product = req.body;

        if (!shop || !topic || !product) return;

        // Find which Org ID this shop belongs to
        const { data: integration } = await supabase
            .from('integrations')
            .select('org_id')
            .eq('platform', 'shopify')
            .ilike('page_id', shop) // page_id holds the shop_domain in your schema
            .maybeSingle();

        if (!integration) return;
        const orgId = integration.org_id;

        if (topic === 'products/create' || topic === 'products/update') {
          const productData = {
                    org_id: orgId,
                    name: product.title,
                    description: product.body_html ? product.body_html.replace(/<[^>]*>?/gm, '').trim() : '',
                    price: Number(product.variants?.[0]?.price) || 0,
                    image_url: product.images?.[0]?.src || null,
                    stock_status: (product.variants?.[0]?.inventory_quantity ?? 1) > 0 ? 'in_stock' : 'out_of_stock',
                    shopify_product_id: String(product.id)
                };

            const textToEmbed = buildProductEmbeddingText(productData);
            const embedding = await generateEmbedding(textToEmbed);

            await supabase.from('products').upsert({
                ...productData,
                embedding: embedding ? JSON.stringify(embedding) : null
            }, { onConflict: 'org_id, shopify_product_id' });

            console.log(`✅ [SHOPIFY WEBHOOK] Product Auto-Synced: ${product.title}`);

        } else if (topic === 'products/delete') {
            await supabase.from('products')
                .delete()
                .eq('org_id', orgId)
                .eq('shopify_product_id', String(product.id));

            console.log(`🗑️ [SHOPIFY WEBHOOK] Product Auto-Deleted: ${product.id}`);
        }
    } catch (err) {
        console.error('❌ [SHOPIFY WEBHOOK ERROR]:', err.message);
    }
};

// 5. SHOPIFY BILLING APPROVAL CALLBACK
export const handleShopifyBillingCallback = async (req, res) => {
  try {
    const { charge_id, workspace_id, plan } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    console.log("👉 [Billing Callback Hit]:", { charge_id, workspace_id, plan });

    if (!workspace_id) {
      return res.redirect(`${frontendUrl}/settings?billing=failed`);
    }

    const rawPlan = (plan || "Grow Pro").toLowerCase();
    let planName = "Grow Pro";
    let messageLimit = 2000;

    if (rawPlan.includes("unlimited") || rawPlan.includes("60")) {
      planName = "Grow Unlimited";
      messageLimit = 10000;
    } else if (rawPlan.includes("premium") || rawPlan.includes("30")) {
      planName = "Grow Premium";
      messageLimit = 5000;
    } else if (rawPlan.includes("pro") || rawPlan.includes("15")) {
      planName = "Grow Pro";
      messageLimit = 2000;
    }

    const { data, error } = await supabase
      .from("billing_accounts")
      .update({
        shopify_plan: planName,
        shopify_status: "active",
        shopify_charge_id: String(charge_id || ""),
        shopify_messages_limit: messageLimit,
        shopify_messages_used: 0,
        updated_at: new Date().toISOString()
      })
      .eq("org_id", workspace_id)
      .select();

    if (error) {
      console.error("❌ DB Update Error:", error);
      return res.redirect(`${frontendUrl}/settings?billing=error`);
    }

    console.log("✅ Plan Updated to:", planName, data);
    return res.redirect(`${frontendUrl}/settings?billing=success`);
  } catch (error) {
    console.error("❌ Callback Fatal Error:", error);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/settings?billing=failed`);
  }
};
// 6. CREATE SHOPIFY RECURRING SUBSCRIPTION
export const createShopifyBillingSubscription = async (req, res) => {
  try {
    const workspaceId =
      req.headers["x-workspace-id"] ||
      req.user?.org_id ||
      req.user?.id ||
      req.user?.userId;

    const { planName, plan, price } = req.body;
    const targetPlan = (plan || planName || "").toLowerCase();

    if (!targetPlan) {
      return res.status(400).json({
        success: false,
        error: "Plan name is required."
      });
    }

    // Fetch active Shopify credentials (Using only valid columns: page_id, access_token)
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token, page_id")
      .eq("platform", "shopify")
      .eq("org_id", workspaceId)
      .maybeSingle();

    if (error) {
      console.error("[Shopify Billing] DB Error:", error.message);
    }

    if (!integration) {
      return res.status(400).json({
        success: false,
        error: "Shopify store is not connected to this workspace."
      });
    }

    // Since shop domain is stored in page_id column based on your table
    const shopDomain = integration.page_id;
    const accessToken = integration.access_token;


    
    if (!shopDomain || !accessToken) {
      return res.status(400).json({
        success: false,
        error: "Shopify store credentials missing in database."
      });
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    const returnUrl = `${backendUrl}/api/v1/shopify/billing/callback?workspace_id=${workspaceId}&plan=${targetPlan}`;

    const confirmationUrl = await shopifyService.createShopifySubscription(
      shopDomain,
      accessToken,
      targetPlan,
      price || 15,
      returnUrl
    );

    return res.status(200).json({ success: true, confirmationUrl });
  } catch (error) {
    console.error("Shopify Billing Controller Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error."
    });
  }
};