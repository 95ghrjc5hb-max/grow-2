import { supabase } from '../config/supabase.js';
import { sendMetaReply, sendWhatsAppReply } from '../services/metaGraphService.js';
import { createShopifyOrder } from '../services/shopifyService.js';
import { getNotificationSettings, getBillingUsage } from '../services/settingsService.js';
import { handleCustomerMessage, transcribeAudioWithGroq } from '../services/aiAgentService.js';
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
            // 🛑 FIRST: Check current billing limits BEFORE creating the chat or increasing token
            const { data: billing } = await supabase
                .from('billing_accounts')
                .select('tokens_used, token_limit')
                .eq('org_id', orgId)
                .maybeSingle();

            const currentUsed = billing?.tokens_used || 0;
            const limit = billing?.token_limit || 30;

            let isBlocked = false;

            if (currentUsed >= limit) {
                // Limit is full! Mark this conversation as blocked so AI won't reply.
                isBlocked = true;
            } else {
                // Safe to increment since limit is not reached yet
                await supabase
                    .from('billing_accounts')
                    .update({ tokens_used: currentUsed + 1 })
                    .eq('org_id', orgId);
            }

            const { data: newConv, error: createError } = await supabase
                .from('conversations')
                .insert({
                    org_id: orgId,
                    customer_name: customerName,
                    customer_identifier: customerId,
                    channel: channel,
                    last_message: initialMessage,
                    status: 'open',
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (createError) throw createError;

            // Attach block flag directly to the returned conversation object
            newConv.is_limit_blocked = isBlocked;
            return newConv;
        }

        // If conversation already exists (Old customer)
        await supabase
            .from('conversations')
            .update({
                last_message: initialMessage,
                updated_at: new Date().toISOString()
            })
            .eq('id', conv.id);

        // Also check if even for existing customers, the limit is already breached
        const { data: billingCheck } = await supabase
            .from('billing_accounts')
            .select('tokens_used, token_limit')
            .eq('org_id', orgId)
            .maybeSingle();

        const usedNow = billingCheck?.tokens_used || 0;
        const limitNow = billingCheck?.token_limit || 30;

        conv.is_limit_blocked = (usedNow >= limitNow);
        return conv;

    } catch (err) {
        console.error('[CONVERSATION SYNC ERROR]:', err.message);
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

        if (message.type === 'text') {
            customerMessage = message.text.body || '';
        } else if (message.type === 'audio' || message.type === 'voice') {
            // WhatsApp voice message handling
            const audioObj = message.audio || message.voice;
            if (audioObj && audioObj.id) {
                try {
                    // Fetch media URL from Meta Graph API using the media ID
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

        // If it's an audio message, transcribe it using Groq Whisper!
        if (audioUrl) {
            customerMessage = await transcribeAudioWithGroq(audioUrl)
        }

        if (!customerMessage) continue;

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

            // 1. Sync Conversation in Supabase
            const conv = await getOrCreateConversation(
              integration.org_id,
              'whatsapp',
              customerPhone,
              `+${customerPhone}`,
              customerMessage
            );

            // 2. Save incoming message in 'messages' table
            if (conv) {
              await supabase.from('messages').insert({
                conversation_id: conv.id,
                sender: 'customer',
                content: customerMessage,
                platform_message_id: message.id || null,
                created_at: new Date()
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
            // AI যদি Paused থাকে, তাহলে বটকে দিয়ে রিপ্লাই না দিয়ে এখানেই থামিয়ে দাও
        if (conv && conv.ai_active === false) {
            console.log('[AI PAUSED] Bot is paused by human agent. Skipping bot reply.');
            continue; 
        }
            // 5. Call AI Service
          // 5. Call AI Service & Check Limit First
// 5. Call AI Service & Check Limit Strictly
        let aiResponse = null;

        // 🛑 STRICT BILLING & LIMIT CHECK
        const { data: currentBilling } = await supabase
            .from('billing_accounts')
            .select('tokens_used, token_limit')
            .eq('org_id', integration.org_id)
            .maybeSingle();

        const currentUsed = currentBilling?.tokens_used || 0;
        const currentLimit = currentBilling?.token_limit || 30;

        // 🚨 CRITICAL RULE: If usage touches or exceeds limit, STOP AI completely for EVERYONE!
        if (currentUsed >= currentLimit || (conv && conv.is_limit_blocked)) {
            console.log(`[AI BLOCKED] Org ${integration.org_id} reached limit: ${currentUsed}/${currentLimit}`);
            aiResponse = {
                reply: "⚠️ Limit reached! Please upgrade or renew your plan to continue using AI.",
                handover: true
            };
        } else if (conv && conv.ai_active === false) {
            console.log('[AI PAUSED] Bot is paused by human agent.');
            continue;
        } else {
            // Safe to call AI since limit is NOT reached yet
            aiResponse = await handleCustomerMessage({
                customerMessage,
                orgId: integration.org_id,
                storeProducts: products || [],
                conversationHistory,
                imageUrl: null
            });
        }
            // 🔔 SEND HUMAN HANDOVER NOTIFICATION
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

        // 6. Send WhatsApp Reply (Text Message)
        await sendWhatsAppReply(token, activePhoneId, customerPhone, replyText);

        // 6.5 🚀 MAGIC: Send WhatsApp Image (If AI provided a product image!)
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
            // 7. Save outgoing message in 'messages' table
            if (conv) {
              await supabase.from('messages').insert({
                conversation_id: conv.id,
                sender: 'bot',
                content: replyText,
                created_at: new Date()
              });
              await supabase
                .from('conversations')
                .update({ last_message: replyText, updated_at: new Date() })
                .eq('id', conv.id);
            }

            // 8. Save Order & Push to Shopify
            if (aiResponse && aiResponse.orderData) {
              const { customerName, phone, address, products: orderedProducts, totalPrice } = aiResponse.orderData;
              if (customerName && orderedProducts && typeof totalPrice === 'number') {
                await supabase.from('orders').insert({
                  org_id: integration.org_id,
                  customer_name: customerName,
                  customer_phone: phone || customerPhone,
                  address: address || null,
                  products: orderedProducts,
                  total_amount: totalPrice,
                  status: 'pending',
                });
                await syncOrderToShopify(integration.org_id, aiResponse.orderData);
              }
              // 🔔 SEND ORDER NOTIFICATION
            await sendAlertToChannels(
                integration.org_id,
                'notifyOnOrderUpdate',
                `🛍️ *New Order Received!*\nCustomer: ${customerName}\nPhone: ${customerPhone || 'N/A'}\nTotal Amount: ${totalPrice}\nProducts: ${JSON.stringify(orderedProducts)}`
            );
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
    for (const entry of body.entry) {
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

        // 🖼️ 1. Extract Image if present
        const imageAttachment = messagingEvent.message?.attachments?.find(att => att.type === 'image');
        const imageUrl = imageAttachment?.payload?.url || null;

        // 🎙️ 2. Extract Audio if present
        const audioAttachment = messagingEvent.message?.attachments?.find(att => att.type === 'audio');
        const audioUrl = audioAttachment?.payload?.url || null;

        // 🎙️ 3. Transcribe Audio using Groq Whisper
        if (audioUrl && !customerMessage) {
            customerMessage = await transcribeAudioWithGroq(audioUrl);
        }

        // 🛑 4. Skip if nothing valid received
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

          // 1. Sync Conversation in Supabase
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

          // 2. Save incoming message in 'messages' table
          if (conv) {
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              sender: 'customer',
              content: customerMessage || '[Customer sent an image]',
              platform_message_id: messagingEvent.message.mid || null,
              created_at: new Date()
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
           // AI যদি Paused থাকে, তাহলে বটকে দিয়ে রিপ্লাই না দিয়ে এখানেই থামিয়ে দাও
        if (conv && conv.ai_active === false) {
            console.log('[AI PAUSED] Bot is paused by human agent. Skipping bot reply.');
            continue; 
        }

          // 5. Call AI Service & Check Limit Strictly (Messenger/IG)
        let aiResponse = null;

        // 🛑 STRICT BILLING & LIMIT CHECK
        const { data: currentBilling } = await supabase
            .from('billing_accounts')
            .select('tokens_used, token_limit')
            .eq('org_id', integration.org_id)
            .maybeSingle();

        const currentUsed = currentBilling?.tokens_used || 0;
        const currentLimit = currentBilling?.token_limit || 30;

        // 🚨 CRITICAL RULE: Block AI if limit is full!
        if (currentUsed >= currentLimit || (conv && conv.is_limit_blocked)) {
            console.log(`[AI BLOCKED - MESSENGER/IG] Org ${integration.org_id} reached limit: ${currentUsed}/${currentLimit}`);
            aiResponse = {
                reply: "⚠️ Limit reached! Please upgrade or renew your plan to continue using AI.",
                handover: true
            };
        } else if (conv && conv.ai_active === false) {
            console.log('[AI PAUSED] Bot is paused by human agent.');
            continue;
        } else {
            // Safe to call AI
            aiResponse = await handleCustomerMessage({
                customerMessage,
                orgId: integration.org_id,
                storeProducts: products || [],
                conversationHistory,
                imageUrl 
            });
        }
          // 🔔 SEND HUMAN HANDOVER NOTIFICATION (Messenger/Instagram)
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

        // 6. Send Meta Reply (Text Message)
        await sendMetaReply(integration.access_token, integration.page_id, senderId, replyText);

        // 6.5 🚀 MAGIC: Send Meta Image (If AI provided a product image!)
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

          // 7. Save outgoing message in 'messages' table
          if (conv) {
            await supabase.from('messages').insert({
              conversation_id: conv.id,
              sender: 'bot',
              content: replyText,
              created_at: new Date()
            });
            await supabase
              .from('conversations')
              .update({ last_message: replyText, updated_at: new Date() })
              .eq('id', conv.id);
          }

          // 8. Save Order & Push to Shopify
          if (aiResponse && aiResponse.orderData) {
            const { customerName, phone, address, products: orderedProducts, totalPrice } = aiResponse.orderData;
            if (customerName && orderedProducts && typeof totalPrice === 'number') {
              await supabase.from('orders').insert({
                org_id: integration.org_id,
                customer_name: customerName,
                customer_phone: phone || null,
                address: address || null,
                products: orderedProducts,
                total_amount: totalPrice,
                status: 'pending',
              });
              await syncOrderToShopify(integration.org_id, aiResponse.orderData);
              // 🔔 SEND ORDER NOTIFICATION (Messenger/Instagram)
            await sendAlertToChannels(
                integration.org_id,
                'notifyOnOrderUpdate',
                `🛍️ *New Order Received (${targetPlatform})!*\nCustomer: ${customerName}\nPhone: ${phone || 'N/A'}\nTotal Amount: ${totalPrice}\nProducts: ${JSON.stringify(orderedProducts)}`
            );
            }
          }
        } catch (err) {
          console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
        }
      }
    }
  }
};