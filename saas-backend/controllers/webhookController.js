import { supabase } from '../config/supabase.js';
import { handleCustomerMessage } from '../services/aiAgentService.js';
import { sendMetaReply, sendWhatsAppReply } from '../services/metaGraphService.js';
import { createShopifyOrder } from '../services/shopifyService.js';

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
      .limit(1)
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
          updated_at: new Date()
        })
        .select()
        .single();

      if (createError) throw createError;
      return newConv;
    } else {
      await supabase
        .from('conversations')
        .update({
          last_message: initialMessage,
          updated_at: new Date()
        })
        .eq('id', conv.id);
      return conv;
    }
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
          if (message.type !== 'text') continue;

          const customerPhone = message.from;
          const customerMessage = message.text?.body || '';

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
            const aiResponse = await handleCustomerMessage({
              customerMessage,
              orgId: integration.org_id,
              storeProducts: products || [],
              conversationHistory,
              imageUrl: null,
            });

            const replyText = typeof aiResponse === 'string'
              ? aiResponse
              : (aiResponse?.reply || 'Sorry, I could not process your request.');

            // 6. Send WhatsApp Reply via Meta API
            await sendWhatsAppReply(token, activePhoneId, customerPhone, replyText);

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
        const customerMessage = messagingEvent.message?.text || '';

        const imageAttachment = messagingEvent.message?.attachments?.find(
          (att) => att.type === 'image'
        );
        const imageUrl = imageAttachment?.payload?.url || null;

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

            // 5. Call AI Service
          const aiResponse = await handleCustomerMessage({
            customerMessage,
            orgId: integration.org_id,
            storeProducts: products || [],
            conversationHistory,
            imageUrl,
          });

          const replyText = typeof aiResponse === 'string'
            ? aiResponse
            : (aiResponse?.reply || 'Sorry, I could not process your request.');

          // 6. Send Meta Reply
          await sendMetaReply(integration.access_token, integration.page_id, senderId, replyText);

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
            }
          }
        } catch (err) {
          console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
        }
      }
    }
  }
};