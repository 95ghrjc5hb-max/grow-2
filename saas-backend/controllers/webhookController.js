import { supabase } from '../config/supabase.js';
import { handleCustomerMessage } from '../services/aiAgentService.js';
import { sendMetaReply, sendWhatsAppReply } from '../services/metaGraphService.js';
import { createShopifyOrder } from '../services/shopifyService.js';

// Meta Webhook Verification (Handles Messenger, Instagram & WhatsApp)
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

// Helper: Push order to Shopify if store is connected
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
        console.log(`[SHOPIFY SYNC SUCCESS]: Order pushed directly to Shopify store (${shopDomain})!`);
      }
    }
  } catch (err) {
    console.error('[SHOPIFY SYNC WARNING]:', err.message);
  }
};

// Central Omnichannel Webhook Receiver
export const handleMetaWebhook = async (req, res) => {
  // Acknowledge Meta immediately to prevent timeouts
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;

  console.log('\n=================== [INCOMING WEBHOOK] ===================');
  console.log('Platform/Object:', body.object);

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
          // Ignore status updates, deliveries, read receipts
          if (message.type !== 'text') {
            console.log('[WHATSAPP SKIPPED]: Non-text message type:', message.type);
            continue;
          }

          const customerPhone = message.from;
          const customerMessage = message.text?.body || '';

          console.log(`[WHATSAPP RECEIVED] From: ${customerPhone} | Text: "${customerMessage}"`);

          try {
            // Retrieve WhatsApp integration by Phone Number ID or general active integration
            let { data: integration, error: integrationError } = await supabase
              .from('integrations')
              .select('*')
              .eq('platform', 'whatsapp')
              .eq('status', 'connected')
              .limit(1)
              .maybeSingle();

            if (integrationError || !integration) {
              console.error('[WHATSAPP ERROR]: No active WhatsApp integration found in Supabase.');
              continue;
            }

            const token = integration.credentials?.apiKey || integration.access_token;
            const activePhoneId = integration.credentials?.phoneNumber || phoneNumberId;

            // 1. Save incoming message
            await supabase.from('messages').insert({
              org_id: integration.org_id,
              platform: 'whatsapp',
              sender_id: customerPhone,
              message: customerMessage,
              direction: 'incoming',
            });

            // 2. Fetch products
            const { data: products } = await supabase
              .from('products')
              .select('*')
              .eq('org_id', integration.org_id);

            // 3. Fetch chat history
            const { data: chatHistory } = await supabase
              .from('messages')
              .select('*')
              .eq('sender_id', customerPhone)
              .order('created_at', { ascending: false })
              .limit(10);

            const conversationHistory = chatHistory ? chatHistory.reverse() : [];

            // 4. Call AI Agent
            console.log('[AI CALL] Requesting AI response for WhatsApp...');
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

            console.log(`[AI GENERATED]: "${replyText}"`);

            // 5. Send WhatsApp reply
            await sendWhatsAppReply(token, activePhoneId, customerPhone, replyText);

            // 6. Save outgoing message
            await supabase.from('messages').insert({
              org_id: integration.org_id,
              platform: 'whatsapp',
              sender_id: customerPhone,
              message: replyText,
              direction: 'outgoing',
            });

            // 7. Save Order & Push to Shopify
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

                // Auto-sync order to Shopify store
                await syncOrderToShopify(integration.org_id, aiResponse.orderData);
              }
            }

            console.log(`[WHATSAPP SUCCESS] Reply delivered to ${customerPhone}!`);
          } catch (err) {
            console.error('[WHATSAPP PROCESSING ERROR]:', err.message);
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

      // Extract events from entry.messaging (Messenger) and entry.changes (Instagram)
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

        console.log(`[MESSAGE RECEIVED] Platform: ${body.object} | Sender: ${senderId} | Text: "${customerMessage}"`);

        if (!senderId || (!customerMessage && !imageUrl)) continue;

        try {
          // 1. Retrieve Connected Integration from Supabase
          const targetPlatform = body.object === 'page' ? 'messenger' : 'instagram';
          
          let { data: integration, error: integrationError } = await supabase
            .from('integrations')
            .select('*')
            .eq('page_id', pageId)
            .eq('platform', targetPlatform)
            .limit(1)
            .maybeSingle();

          // Fallback for Instagram
          if (!integration && body.object === 'instagram') {
            console.log('[DB LOOKUP] Fetching active Instagram integration fallback...');
            const { data: fallbackInt } = await supabase
              .from('integrations')
              .select('*')
              .eq('platform', 'instagram')
              .limit(1)
              .maybeSingle();
            integration = fallbackInt;
          }

          if (integrationError || !integration) {
            console.error(`[WEBHOOK ERROR]: Integration not found for ${body.object} ID: ${pageId}`);
            continue;
          }

          console.log(`[DB SUCCESS] Found Integration ID: ${integration.id} (Platform: ${integration.platform})`);

          // 2. Save incoming message
          const storedIncomingMessage = customerMessage || '[Customer sent an image]';
          await supabase.from('messages').insert({
            org_id: integration.org_id,
            platform: body.object,
            sender_id: senderId,
            message: storedIncomingMessage,
            direction: 'incoming',
          });

          // 3. Fetch products
          const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('org_id', integration.org_id);

          // 4. Fetch chat history
          const { data: chatHistory } = await supabase
            .from('messages')
            .select('*')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(10);

          const conversationHistory = chatHistory ? chatHistory.reverse() : [];

          // 5. Call AI Agent
          console.log('[AI CALL] Requesting AI response...');
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

          console.log(`[AI GENERATED]: "${replyText}"`);

          // 6. Send Meta Reply
          console.log(`[SENDING REPLY] Delivering to ${senderId}...`);
          await sendMetaReply(integration.access_token, integration.page_id, senderId, replyText);

          // 7. Save outgoing message
          await supabase.from('messages').insert({
            org_id: integration.org_id,
            platform: body.object,
            sender_id: senderId,
            message: replyText,
            direction: 'outgoing',
          });

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

              // Auto-sync order to Shopify store
              await syncOrderToShopify(integration.org_id, aiResponse.orderData);
            }
          }

          console.log(`[SUCCESS] Message successfully sent to ${senderId}!`);
        } catch (err) {
          console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
        }
      }
    }
  }
};