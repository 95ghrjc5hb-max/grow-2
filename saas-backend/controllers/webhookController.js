import { supabase } from '../config/supabase.js';
import { generateAiReply } from '../services/aiAgentService.js';
import { sendMessageToMeta } from '../services/metaGraphService.js';

// Verify Meta Webhook Token
export const verifyWebhook = (req, res) => {
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'grow_saas_secure_token';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

// Receive Real-time Incoming Customer Messages
export const handleIncomingWebhook = async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'page' || body.object === 'instagram') {
      for (const entry of body.entry) {
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;
        const messageText = webhookEvent.message?.text;

        if (messageText) {
          // 1. Save message to Supabase Unified Inbox
          await supabase.from('conversations').insert([{
            sender_id: senderId,
            message: messageText,
            platform: body.object,
            created_at: new Date()
          }]);

          // 2. Generate AI Reply
          const aiReply = await generateAiReply({ customerMessage: messageText });

          // 3. Send AI reply back to Meta API
          await sendMessageToMeta({
            recipientId: senderId,
            textMessage: aiReply,
            accessToken: process.env.META_PAGE_ACCESS_TOKEN
          });
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
    res.sendStatus(404);
  } catch (error) {
    console.error('🔴 [WEBHOOK ERROR]:', error.message);
    res.sendStatus(500);
  }
};
