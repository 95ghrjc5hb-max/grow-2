import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { supabase } from '../config/supabase.js';
import { sendMetaReply, sendWhatsAppReply } from '../services/metaGraphService.js';
import { createShopifyOrder } from '../services/shopifyService.js';
import { getNotificationSettings, getBillingUsage } from '../services/settingsService.js';
import { handleCustomerMessage, transcribeAudioWithGroq } from '../services/aiAgentService.js';
import { checkAndIncrementMetaUsage } from '../services/usageService.js';
// --- Helper: Send Notification to Slack & Discord ---
const sendAlertToChannels = async (orgId, eventType, textMessage) => {
    try {
        const settings = await getNotificationSettings(orgId);
        if (!settings) return;

        const pushToWebhook = async (url, payload) => {
            if (!url) return;
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        };

        // Slack check & send
        if (settings.slack && settings.slack[eventType] && settings.slack.webhookUrl) {
            await pushToWebhook(settings.slack.webhookUrl, { text: `🔔 *Grow SaaS Alert:*\n${textMessage}` });
        }

        // Discord check & send
        if (settings.discord && settings.discord[eventType] && settings.discord.webhookUrl) {
            await pushToWebhook(settings.discord.webhookUrl, { content: `🔔 **Grow SaaS Alert:**\n${textMessage}` });
        }
    } catch (err) {
        console.error('[NOTIFICATION ERROR]', err.message);
    }
};

// Meta Webhook Verification (Messenger, Instagram & WhatsApp)
export const verifyMetaWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    console.log('[WEBHOOK VERIFIED]');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// Helper: Get or Create Conversation Thread in Supabase
const getOrCreateConversation = async (orgId, channel, customerId, customerName, initialMessage) => {
  try {
    let { data: conv } = await supabase
      .from('conversations')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_identifier', customerId)
      .eq('channel', channel)
      .maybeSingle();

    if (!conv) {
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          org_id: orgId,
          customer_name: customerName,
          customer_identifier: customerId,
          channel: channel,
          last_message: initialMessage,
          status: 'open',
          message_count: 0,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;
      return newConv;
    }

    // Update conversation timestamp & last message
    await supabase
      .from('conversations')
      .update({
        last_message: initialMessage,
        updated_at: new Date().toISOString()
      })
      .eq('id', conv.id);

    return conv;
  } catch (err) {
    console.error('CONVERSATION SYNC ERROR:', err.message);
    return null;
  }
};

// Helper: Push order to Shopify
const syncOrderToShopify = async (orgId, orderData) => {
  try {
    const { data: shopifyInt } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('platform', 'shopify')
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle();

    if (shopifyInt && shopifyInt.access_token) {
      const shopDomain = shopifyInt.metadata?.shop_domain || shopifyInt.account_name;
      if (shopDomain) {
        await createShopifyOrder(shopDomain, shopifyInt.access_token, orderData);
      }
    }
  } catch (err) {
    console.error('[SHOPIFY SYNC WARNING]:', err.message);
  }
};

// Central Omnichannel Webhook Receiver
export const handleMetaWebhook = async (req, res) => {
  // 1. CRYPTOGRAPHIC SECURITY: Verify Meta HMAC-SHA256 Signature
  const signature = req.headers['x-hub-signature-256'];
  const appSecret = process.env.META_APP_SECRET;

  if (process.env.NODE_ENV === 'production' || signature) {
    if (!signature || !appSecret) {
      console.error('Security Alert: Missing Meta signature or META_APP_SECRET');
      return res.status(401).json({ error: 'Unauthorized webhook request' });
    }

    const elements = signature.split('=');
    const signatureHash = elements[1];

    // Calculate expected hash using captured rawBody
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    // Timing-safe evaluation against timing attacks
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(signatureHash, 'utf8'),
      Buffer.from(expectedHash, 'utf8')
    );

    if (!isSignatureValid) {
      console.warn('Security Alert: Fake Meta webhook detected! Request dropped.');
      return res.status(403).json({ error: 'Invalid HMAC signature' });
    }
  }

  // Acknowledge Meta immediately to prevent retry-loops and connection holding
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;

  // =========================================================================
  // 1. WHATSAPP BUSINESS CLOUD API HANDLER
  // =========================================================================
  if (body.object === 'whatsapp_business_account') {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages;

        if (!messages || messages.length === 0) continue;

        for (const message of messages) {
          const customerPhone = message.from;
          let customerMessage = '';
          let audioUrl = null;

          try {
            let { data: integration } = await supabase
              .from('integrations')
              .select('*')
              .eq('platform', 'whatsapp')
              .eq('status', 'connected')
              .limit(1)
              .maybeSingle();

            if (!integration) continue;

            const token = integration.access_token;
            const activePhoneId = integration.page_id || phoneNumberId;

            // Handle Text or Audio Message
            if (message.type === 'text') {
              customerMessage = message.text.body || '';
            } else if (message.type === 'audio' || message.type === 'voice') {
              const audioObj = message.audio || message.voice;
              if (audioObj && audioObj.id) {
                try {
                  const mediaRes = await fetch(`https://graph.facebook.com/v19.0/${audioObj.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  });
                  const mediaData = await mediaRes.json();
                  if (mediaData && mediaData.url) {
                    audioUrl = mediaData.url;
                  }
                } catch (err) {
                  console.error('[WHATSAPP AUDIO URL FETCH ERROR]:', err.message);
                }
              }
            }

            if (audioUrl) {
              customerMessage = await transcribeAudioWithGroq(audioUrl);
            }

            if (!customerMessage) continue;

            // 1. Sync Conversation in Supabase
            const conv = await getOrCreateConversation(
              integration.org_id,
              'whatsapp',
              customerPhone,
              `+${customerPhone}`,
              customerMessage
            );

            // 2. Save incoming message
            if (conv) {
              await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: integration.org_id,           // <--- এই লাইনটি যোগ করুন
  sender: 'customer',
  content: customerMessage,
  platform_message_id: message.id || null,
  created_at: new Date().toISOString()
});
            }

            // 3. Fetch products
            const { data: products } = await supabase
              .from('products')
              .select('*')
              .eq('org_id', integration.org_id);

            // 4. Fetch chat memory
            let conversationHistory = [];
            if (conv) {
              const { data: chatHistory } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conv.id)
                .order('created_at', { ascending: false })
                .limit(10);

              conversationHistory = (chatHistory || []).reverse().map(m => ({
                role: m.sender === 'customer' ? 'user' : 'assistant',
                content: m.content || ''
              }));
            }

            if (conv && conv.ai_active === false) {
              console.log('[AI PAUSED] Bot is paused by human agent. Skipping bot reply.');
              continue; 
            }

            // 5. Call AI Service & Check Meta Customer Limit
    let aiResponse = null;
    const usage = await checkAndIncrementMetaUsage(integration.org_id, customerPhone);

    if (!usage.allowed) {
      console.log(`[AI BLOCKED] WhatsApp Org ${integration.org_id} reached Meta limit (${usage.reason})`);
      aiResponse = {
        reply: "⚠️ Limit reached! Please upgrade or renew your plan to continue using AI.",
        handover: true
      };
    } else {
      aiResponse = await handleCustomerMessage({
        customerMessage,
        orgId: integration.org_id,
        storeProducts: products || [],
        conversationHistory,
        imageUrl: null
      });
    }

            if (aiResponse && aiResponse.handover) {
              await sendAlertToChannels(
                integration.org_id,
                'notifyOnHandover',
                `⚠️ *Human Handover Requested!*\nCustomer Phone: ${customerPhone} needs human assistance.`
              );
            }

            const replyText = typeof aiResponse === 'string'
              ? aiResponse
              : (aiResponse?.reply || 'Sorry, I could not process your request.');

            const replyImage = typeof aiResponse === 'object' ? aiResponse?.image_url : null;

            // 6. Send WhatsApp Reply
            await sendWhatsAppReply(token, activePhoneId, customerPhone, replyText);

            if (replyImage && replyImage.startsWith('http')) {
              try {
                await fetch(`https://graph.facebook.com/v19.0/${activePhoneId}/messages`, {
                  method: 'POST',
                  headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                  },
                  body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: customerPhone,
                    type: 'image',
                    image: { link: replyImage }
                  })
                });
              } catch (imgErr) {
                console.error('[WHATSAPP IMAGE SEND ERROR]:', imgErr.message);
              }
            }

            // 7. Save outgoing message
            if (conv) {
              await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: integration.org_id,           // <--- এই লাইনটি যোগ করুন
  sender: 'bot',
  content: replyText,
  created_at: new Date().toISOString()
});
              await supabase
                .from('conversations')
                .update({ last_message: replyText, updated_at: new Date() })
                .eq('id', conv.id);
            }

            // 8. Dynamic Order Creation (WhatsApp)
            if (aiResponse && aiResponse.orderData) {
              const orderData = aiResponse.orderData;
              const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;

              const finalCustomerName = 
                orderData.customer_name || 
                orderData.customerName || 
                orderData.name || 
                'Valued Customer';

              const finalPhone = 
                orderData.phone_number || 
                orderData.phone || 
                customerPhone || 
                null;

              const finalAddress = 
                orderData.delivery_address || 
                orderData.address || 
                null;

              const quantity = parseInt(orderData.product_quantity || orderData.quantity || 1, 10);
              const finalTotal = parseFloat(orderData.totalPrice || orderData.total_amount || 0);
              const deliveryCharge = parseFloat(orderData.delivery_charge || 0);

              const coreKeys = new Set([
                'customer_name', 'customerName', 'name',
                'phone_number', 'phone', 'customer_phone',
                'delivery_address', 'address',
                'product_quantity', 'quantity',
                'product_title', 'product_name', 'products', 'orderedProducts',
                'totalPrice', 'total_amount', 'delivery_charge'
              ]);

              const dynamicCustomDetails = {};
              const variantSpecs = [];

              Object.entries(orderData).forEach(([key, value]) => {
                if (!coreKeys.has(key) && value !== null && value !== undefined) {
                  dynamicCustomDetails[key] = value;
                  if (key !== 'delivery_zone' && key !== 'currency') {
                    variantSpecs.push(`${key}: ${value}`);
                  }
                }
              });

              const baseProductName = 
                orderData.product_title || 
                orderData.product_name || 
                orderData.products || 
                (Array.isArray(products) && products.length > 0 ? (products[0].title || products[0].name) : 'Ordered Product');

              const variantSuffix = variantSpecs.length > 0 ? ` (${variantSpecs.join(', ')})` : '';
              const finalProducts = `${quantity}x ${baseProductName}${variantSuffix}`;

              await supabase.from('orders').insert([{
                org_id: integration.org_id,
                order_id: generatedOrderId,
                customer_name: finalCustomerName,
                customer_phone: finalPhone,
                address: finalAddress,
                products: finalProducts,
                total_amount: finalTotal,
                status: 'pending',
                custom_details: dynamicCustomDetails,
                delivery_charge: deliveryCharge
              }]);

              try {
                await syncOrderToShopify(integration.org_id, aiResponse.orderData);
              } catch (shopifyErr) {
                console.warn('[SHOPIFY SYNC WARNING]:', shopifyErr.message);
              }

              try {
                await sendAlertToChannels(
                  integration.org_id,
                  'notifyOnOrderUpdate',
                  `🛍️ New WhatsApp Order!\n🆔 Order: ${generatedOrderId}\n👤 Customer: ${finalCustomerName}\n📞 Phone: ${finalPhone || 'N/A'}\n📦 Items: ${finalProducts}\n💰 Total: ${finalTotal}`
                );
              } catch (alertErr) {
                console.warn('[ALERT WARNING]:', alertErr.message);
              }
            }
          } catch (err) {
            console.error('[WHATSAPP WEBHOOK ERROR]:', err.message);
          }
        }
      }
    }
    return;
  }

  // =========================================================================
  // 2. FACEBOOK MESSENGER & INSTAGRAM HANDLER
  // =========================================================================
  if (body.object === 'page' || body.object === 'instagram') {
    for (const entry of body.entry || []) {
      const pageId = entry.id;

      let events = [];
      if (entry.messaging && Array.isArray(entry.messaging)) {
        events = entry.messaging;
      } else if (entry.changes && Array.isArray(entry.changes)) {
        events = entry.changes
          .filter((change) => change.field === 'messages' && change.value)
          .map((change) => change.value);
      }

      if (events.length === 0) continue;

      for (const messagingEvent of events) {
        if (!messagingEvent.message || messagingEvent.message.is_echo) continue;

        const senderId = messagingEvent.sender?.id;
        let customerMessage = messagingEvent.message?.text || '';

        // 1. Extract Image & Audio
        const imageAttachment = messagingEvent.message?.attachments?.find(att => att.type === 'image');
        const imageUrl = imageAttachment?.payload?.url || null;

        const audioAttachment = messagingEvent.message?.attachments?.find(att => att.type === 'audio');
        const audioUrl = audioAttachment?.payload?.url || null;

        if (audioUrl && !customerMessage) {
          customerMessage = await transcribeAudioWithGroq(audioUrl);
        }

        if (!senderId || (!customerMessage && !imageUrl)) continue;

        try {
          const targetPlatform = body.object === 'page' ? 'messenger' : 'instagram';
          
          let { data: integration } = await supabase
            .from('integrations')
            .select('*')
            .eq('page_id', pageId)
            .eq('platform', targetPlatform)
            .limit(1)
            .maybeSingle();

          if (!integration && body.object === 'instagram') {
            const { data: fallbackInt } = await supabase
              .from('integrations')
              .select('*')
              .eq('platform', 'instagram')
              .limit(1)
              .maybeSingle();
            integration = fallbackInt;
          }

          if (!integration) continue;

          // 1. Sync Conversation
          const displayName = targetPlatform === 'messenger' 
            ? `Messenger User (${senderId.slice(-4)})` 
            : `Instagram User (${senderId.slice(-4)})`;

          const conv = await getOrCreateConversation(
            integration.org_id,
            targetPlatform,
            senderId,
            displayName,
            customerMessage || '[Customer sent an image]'
          );

          // 2. Save incoming message
          if (conv) {
            await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: integration.org_id,           // <--- এই লাইনটি যোগ করুন
  sender: 'customer',
  content: customerMessage || '[Customer sent an image]',
  platform_message_id: messagingEvent.message.mid || null,
  created_at: new Date().toISOString()
});
          }

          // 3. Fetch products
          const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('org_id', integration.org_id);

          // 4. Fetch chat memory
          let conversationHistory = [];
          if (conv) {
            const { data: chatHistory } = await supabase
              .from('messages')
              .select('*')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(10);

            conversationHistory = (chatHistory || []).reverse().map(m => ({
              direction: m.sender === 'customer' ? 'incoming' : 'outgoing',
              message: m.content
            }));
          } 

          if (conv && conv.ai_active === false) {
            console.log('[AI PAUSED] Bot is paused by human agent. Skipping bot reply.');
            continue; 
          }

          // 5. Call AI Service & Check Meta Customer Limit
    let aiResponse = null;
    const usage = await checkAndIncrementMetaUsage(integration.org_id, senderId);

    if (!usage.allowed) {
      console.log(`[AI BLOCKED] Messenger/IG Org ${integration.org_id} reached Meta limit (${usage.reason})`);
      aiResponse = {
        reply: "⚠️ Limit reached! Please upgrade or renew your plan to continue using AI.",
        handover: true
      };
    } else {
      aiResponse = await handleCustomerMessage({
        customerMessage,
        orgId: integration.org_id,
        storeProducts: products || [],
        conversationHistory,
        imageUrl
      });
    }
          if (aiResponse && aiResponse.handover) {
            await sendAlertToChannels(
              integration.org_id,
              'notifyOnHandover',
              `⚠️ *Human Handover Requested!*\nCustomer (${targetPlatform}): ${customerMessage}`
            );
          }
         
          const replyText = typeof aiResponse === 'string'
            ? aiResponse
            : (aiResponse?.reply || 'Sorry, I could not process your request.');
            
          const replyImage = typeof aiResponse === 'object' ? aiResponse?.image_url : null;

          // 6. Send Meta Reply
          await sendMetaReply(integration.access_token, integration.page_id, senderId, replyText);

          if (replyImage && replyImage.startsWith('http')) {
            try {
              await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${integration.access_token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  recipient: { id: senderId },
                  message: {
                    attachment: {
                      type: 'image',
                      payload: { url: replyImage, is_reusable: true }
                    }
                  }
                })
              });
            } catch (imgErr) {
              console.error('[IMAGE SEND ERROR]:', imgErr.message);
            }
          }

          // 7. Save outgoing message
          if (conv) {
            await supabase.from('messages').insert({
  conversation_id: conv.id,
  org_id: integration.org_id,           // <--- এই লাইনটি যোগ করুন
  sender: 'bot',
  content: replyText,
  created_at: new Date().toISOString()
});
            await supabase
              .from('conversations')
              .update({ last_message: replyText, updated_at: new Date() })
              .eq('id', conv.id);
          }

          // 8. Dynamic Order Creation (Messenger & Instagram)
          if (aiResponse && aiResponse.orderData) {
            const orderData = aiResponse.orderData;
            const generatedOrderId = `ORD-${Date.now().toString().slice(-6)}`;

            const finalCustomerName = 
              orderData.customer_name || 
              orderData.customerName || 
              orderData.name || 
              orderData.fullName || 
              'Valued Customer';

            const finalPhone = 
              orderData.phone_number || 
              orderData.phone || 
              orderData.customer_phone || 
              null;

            const finalAddress = 
              orderData.delivery_address || 
              orderData.address || 
              orderData.shipping_address || 
              null;

            const quantity = parseInt(orderData.product_quantity || orderData.quantity || 1, 10);
            const finalTotal = parseFloat(orderData.totalPrice || orderData.total_amount || 0);
            const deliveryCharge = parseFloat(orderData.delivery_charge || 0);

            const coreKeys = new Set([
              'customer_name', 'customerName', 'name', 'fullName',
              'phone_number', 'phone', 'customer_phone',
              'delivery_address', 'address', 'shipping_address',
              'product_quantity', 'quantity',
              'product_title', 'product_name', 'products', 'orderedProducts',
              'totalPrice', 'total_amount', 'delivery_charge'
            ]);

            const dynamicCustomDetails = {};
            const variantSpecs = [];

            Object.entries(orderData).forEach(([key, value]) => {
              if (!coreKeys.has(key) && value !== null && value !== undefined) {
                dynamicCustomDetails[key] = value;
                if (key !== 'delivery_zone' && key !== 'currency') {
                  variantSpecs.push(`${key}: ${value}`);
                }
              }
            });

            let finalProducts = orderData.product_title || orderData.product_name || orderData.products;
            if (!finalProducts) {
              const fallbackName = (Array.isArray(products) && products.length > 0)
                ? (products[0].title || products[0].name)
                : 'Ordered Product';
              const variantSuffix = variantSpecs.length > 0 ? ` (${variantSpecs.join(', ')})` : '';
              finalProducts = `${quantity}x ${fallbackName}${variantSuffix}`;
            }

            const { data: savedOrder, error: orderInsertErr } = await supabase
              .from('orders')
              .insert([{
                org_id: integration.org_id,
                order_id: generatedOrderId,
                customer_name: finalCustomerName,
                customer_phone: finalPhone,
                address: finalAddress,
                products: finalProducts,
                total_amount: finalTotal,
                status: 'pending',
                custom_details: dynamicCustomDetails,
                delivery_charge: deliveryCharge
              }])
              .select();

            if (orderInsertErr) {
              console.error('[DATABASE ORDER INSERT ERROR]:', orderInsertErr);
            } else {
              console.log('[DATABASE ORDER CREATED SUCCESS]:', savedOrder);
            }

            try {
              await syncOrderToShopify(integration.org_id, aiResponse.orderData);
            } catch (shopifyErr) {
              console.warn('[SHOPIFY SYNC WARNING]:', shopifyErr.message);
            }

            try {
              const alertMsg = "🛍️ New Order Received (" + targetPlatform + ")!\n" +
                "🆔 Order: " + generatedOrderId + "\n" +
                "👤 Customer: " + finalCustomerName + "\n" +
                "📞 Phone: " + (finalPhone || 'N/A') + "\n" +
                "📦 Items: " + finalProducts + "\n" +
                "💰 Total: " + finalTotal;

              await sendAlertToChannels(
                integration.org_id,
                'notifyOnOrderUpdate',
                alertMsg
              );
            } catch (alertErr) {
              console.warn('[ALERT CHANNELS WARNING]:', alertErr.message);
            }
          }
        } catch (err) {
          console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
        }
      }
    }
  }
};
// ==========================================
// SHOPIFY MANDATORY GDPR COMPLIANCE WEBHOOKS
// ==========================================

// 1. GDPR: Customers Data Request
export const handleCustomerDataRequest = async (req, res) => {
  try {
    const { shop_domain, customer } = req.body;
    console.log(`[GDPR] Customer data request for ${customer?.email || 'Customer'} on ${shop_domain}`);
    return res.status(200).json({ success: true, message: 'Data request logged' });
  } catch (err) {
    console.error('[GDPR Error] Customer Data Request:', err);
    return res.status(200).send('OK');
  }
};

// 2. GDPR: Customers Redact (Delete Customer Data)
export const handleCustomerRedact = async (req, res) => {
  try {
    const { shop_domain, customer } = req.body;
    console.log(`[GDPR] Customer redact request for ${customer?.email || 'Customer'} on ${shop_domain}`);
    return res.status(200).json({ success: true, message: 'Customer redact processed' });
  } catch (err) {
    console.error('[GDPR Error] Customer Redact:', err);
    return res.status(200).send('OK');
  }
};

// 3. GDPR: Shop Redact (Delete Store Data after 48 hours)
export const handleShopRedact = async (req, res) => {
  try {
    const { shop_domain } = req.body;
    console.log(`[GDPR] Shop redact request for ${shop_domain}`);

    // Update integration status to disconnected
    await supabase
      .from('integrations')
      .update({ status: 'disconnected', access_token: null })
      .ilike('page_id', `%${shop_domain}%`);

    return res.status(200).json({ success: true, message: 'Shop data cleaned' });
  } catch (err) {
    console.error('[GDPR Error] Shop Redact:', err);
    return res.status(200).send('OK');
  }
};