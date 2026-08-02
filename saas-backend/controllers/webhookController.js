import { supabase } from '../config/supabase.js';
import { generateAiReply } from '../services/aiAgentService.js';
import { sendMetaReply } from '../services/metaGraphService.js';

/**
 * Meta Webhook Verification (GET Request Challenge)
 */
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

/**
 * Meta Incoming Messages Receiver (POST Request)
 */
export const handleMetaWebhook = async (req, res) => {
  // Always return 200 OK immediately to Meta to avoid timeout
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;

  if (body.object === 'page' || body.object === 'instagram') {
    for (const entry of body.entry) {
      const pageId = entry.id;
      const messagingEvent = entry.messaging?.[0];

      if (!messagingEvent || !messagingEvent.message || messagingEvent.message.is_echo) {
        continue; // Skip system messages or self echoes
      }

      const senderId = messagingEvent.sender.id;
      const customerMessage = messagingEvent.message.text;

      if (!customerMessage) continue;

      try {
        // 1. Retrieve Connected Integration Credentials from Supabase
        const { data: integration, error } = await supabase
          .from('integrations')
          .select('*, stores(*)')
          .or(`page_id.eq.${pageId},instagram_id.eq.${pageId}`)
          .single();

        if (error || !integration) {
          console.error(`[WEBHOOK ERROR]: Integration not found for Page ID: ${pageId}`);
          continue;
        }

        // 2. Save Customer's Incoming Message to DB for Unified Inbox
        await supabase.from('messages').insert({
          store_id: integration.store_id,
          platform: body.object,
          sender_id: senderId,
          message: customerMessage,
          direction: 'incoming'
        });

        // 3. Fetch Inventory / Products for Context
        const { data: products } = await supabase
          .from('products')
          .select('*')
          .eq('store_id', integration.store_id);

        // 4. Generate AI Reply using Groq AI
        const aiResponse = await generateAiReply({
          customerMessage,
          storeProducts: products || [],
          conversationHistory: [] // Fetch recent messages if needed
        });

        // Handle string or object responses from aiAgentService
        const replyText = typeof aiResponse === 'string' ? aiResponse : aiResponse.reply;

        // 5. Send AI Reply back to Meta Graph API
        await sendMetaReply(integration.access_token, senderId, replyText);

        // 6. Save Outgoing AI Message to DB
        await supabase.from('messages').insert({
          store_id: integration.store_id,
          platform: body.object,
          sender_id: senderId,
          message: replyText,
          direction: 'outgoing'
        });

        // 7. Process Extracted Order Data if present
        if (aiResponse.orderData) {
          await supabase.from('orders').insert({
            store_id: integration.store_id,
            customer_name: aiResponse.orderData.customerName,
            phone: aiResponse.orderData.phone,
            address: aiResponse.orderData.address,
            products: aiResponse.orderData.products,
            total_amount: aiResponse.orderData.totalPrice,
            status: 'pending'
          });
        }

      } catch (err) {
        console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
      }
    }
  }
};
