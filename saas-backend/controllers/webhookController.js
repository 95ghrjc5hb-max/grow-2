import { supabase } from '../config/supabase.js';
import { handleCustomerMessage } from '../services/aiAgentService.js';
import { sendMetaReply } from '../services/metaGraphService.js';

// Meta Webhook Verification
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

// Meta Incoming Messages Receiver (Omnichannel: Messenger + Instagram)
export const handleMetaWebhook = async (req, res) => {
  // Acknowledge Meta immediately to avoid timeouts
  res.status(200).send('EVENT_RECEIVED');
  const body = req.body;

  console.log('\n=================== [INCOMING WEBHOOK] ===================');
  console.log('Platform/Object:', body.object);
  console.log('Full Payload:', JSON.stringify(body, null, 2));

  if (body.object === 'page' || body.object === 'instagram') {
    for (const entry of body.entry) {
      const pageId = entry.id;

      // Extract events from both entry.messaging (Messenger) and entry.changes (Instagram)
      let events = [];
      if (entry.messaging && Array.isArray(entry.messaging)) {
        events = entry.messaging;
      } else if (entry.changes && Array.isArray(entry.changes)) {
        events = entry.changes
          .filter((change) => change.field === 'messages' && change.value)
          .map((change) => change.value);
      }

      if (events.length === 0) {
        console.log('[SKIPPED]: No valid messaging or changes events found');
        continue;
      }

      for (const messagingEvent of events) {
        if (!messagingEvent.message || messagingEvent.message.is_echo) {
          console.log('[SKIPPED]: Echo message or delivery event');
          continue;
        }

        const senderId = messagingEvent.sender?.id;
        const customerMessage = messagingEvent.message?.text || '';

        // Extract photo attachment URL if available
        const imageAttachment = messagingEvent.message?.attachments?.find(
          (att) => att.type === 'image'
        );
        const imageUrl = imageAttachment?.payload?.url || null;

        console.log(`[MESSAGE RECEIVED] Platform: ${body.object} | Sender: ${senderId} | Text: "${customerMessage}"`);

        if (!senderId || (!customerMessage && !imageUrl)) {
          console.log('[SKIPPED]: Empty content or missing sender');
          continue;
        }

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

          // Fallback for Instagram if pageId differs
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

          // 2. Save Customer's Incoming Message
          const storedIncomingMessage = customerMessage || '[Customer sent an image]';
          await supabase.from('messages').insert({
            org_id: integration.org_id,
            platform: body.object,
            sender_id: senderId,
            message: storedIncomingMessage,
            direction: 'incoming',
          });

          // 3. Fetch Inventory / Products for Context
          const { data: products } = await supabase
            .from('products')
            .select('*')
            .eq('org_id', integration.org_id);

          // 4. Fetch Chat History for AI Memory
          const { data: chatHistory } = await supabase
            .from('messages')
            .select('*')
            .eq('sender_id', senderId)
            .order('created_at', { ascending: false })
            .limit(10);

          const conversationHistory = chatHistory ? chatHistory.reverse() : [];

          // 5. Call AI Service
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

          // 7. Save Outgoing AI Message
          await supabase.from('messages').insert({
            org_id: integration.org_id,
            platform: body.object,
            sender_id: senderId,
            message: replyText,
            direction: 'outgoing',
          });

          console.log(`[SUCCESS] Message successfully sent to ${senderId}!`);
        } catch (err) {
          console.error('[WEBHOOK PROCESSING ERROR]:', err.message);
        }
      }
    }
  }
};