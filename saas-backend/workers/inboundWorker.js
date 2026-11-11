import { Worker } from 'bullmq';
import crypto from 'node:crypto';
import { redisWorkerConnection } from '../config/queue.js';
import { supabase } from '../config/supabase.js';
import { enqueueOutboundMessage } from '../services/queueService.js';
import { handleCustomerMessage, transcribeAudioWithGroq } from '../services/aiAgentService.js';
import { checkAndIncrementMetaUsage } from '../services/usageService.js';
import { getNotificationSettings } from '../services/settingsService.js';
import { createShopifyOrder } from '../services/shopifyService.js';

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
        body: JSON.stringify(payload),
      });
    };

    if (settings.slack && settings.slack[eventType] && settings.slack.webhookUrl) {
      await pushToWebhook(settings.slack.webhookUrl, { text: `🔔 *Grow SaaS Alert:*\n${textMessage}` });
    }

    if (settings.discord && settings.discord[eventType] && settings.discord.webhookUrl) {
      await pushToWebhook(settings.discord.webhookUrl, { content: `🔔 **Grow SaaS Alert:**\n${textMessage}` });
    }
  } catch (err) {
    console.error('[NOTIFICATION ERROR]', err.message);
  }
};

// --- Helper: Safe Message Insert (falls back gracefully if optional columns are missing) ---
const insertMessageSafe = async (payload) => {
  const { data, error } = await supabase.from('messages').insert(payload).select('id').single();
  if (!error) return data;

  if (error.message && (error.message.includes('status') || error.message.includes('image_url'))) {
    const { status, image_url, ...minimalPayload } = payload;
    const retry = await supabase.from('messages').insert(minimalPayload).select('id').single();
    if (!retry.error) return retry.data;
    console.error('[MSG INSERT ERROR]', retry.error.message);
    return null;
  }

  console.error('[MSG INSERT ERROR]', error.message);
  return null;
};

// --- Helper: Get or Create Conversation Thread (with race-condition retry) ---
const getOrCreateConversation = async (orgId, channel, customerId, customerName, initialMessage) => {
  try {
    const { data: conv, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('org_id', orgId)
      .eq('customer_identifier', customerId)
      .eq('channel', channel)
      .maybeSingle();

    if (error) {
      console.error('CONVERSATION FETCH ERROR:', error.message);
      return null;
    }

    if (conv) {
      await supabase
        .from('conversations')
        .update({
          last_message: initialMessage,
          message_count: (conv.message_count || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conv.id);
      return conv;
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
        ai_active: true,
        message_count: 1,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (createError) {
      const { data: retryConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('org_id', orgId)
        .eq('customer_identifier', customerId)
        .eq('channel', channel)
        .maybeSingle();
      if (retryConv) return retryConv;
      throw createError;
    }

    return newConv;
  } catch (err) {
    console.error('CONVERSATION SYNC ERROR:', err.message);
    return null;
  }
};

// --- Helper: Sync Order to Shopify (Reads from credentials JSONB) ---
const syncOrderToShopify = async (orgId, orderData) => {
  try {
    const { data: shopifyInt } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('platform', 'shopify')
      .limit(1)
      .maybeSingle();

    if (!shopifyInt || shopifyInt.is_connected === false || shopifyInt.status === 'disconnected') {
      return;
    }

    const creds = shopifyInt.credentials || {};
    const accessToken = shopifyInt.access_token || creds.access_token || creds.accessToken;
    const shopDomain =
      creds.shop_domain ||
      creds.shopDomain ||
      creds.shop ||
      shopifyInt.page_id;

    if (shopDomain && accessToken) {
      await createShopifyOrder(shopDomain, accessToken, orderData);
    }
  } catch (err) {
    console.warn('[SHOPIFY SYNC WARNING]:', err.message);
  }
};

// --- Helper: Resolve WhatsApp Audio URL from Media ID in Background ---
const resolveWhatsAppAudioUrl = async (orgId, integrationId, audioMediaId) => {
  try {
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, credentials')
      .eq('org_id', orgId)
      .eq('id', integrationId)
      .maybeSingle();

    const creds = integration?.credentials || {};
    const token =
      integration?.access_token ||
      creds.access_token ||
      creds.accessToken ||
      process.env.META_SYSTEM_USER_TOKEN;

    if (!token) return null;

    const mediaRes = await fetch(`https://graph.facebook.com/v21.0/${audioMediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mediaData = await mediaRes.json();
    return mediaData?.url || null;
  } catch (err) {
    console.error('[WHATSAPP AUDIO URL FETCH ERROR]:', err.message);
    return null;
  }
};

// ─── INBOUND WORKER ──────────────────────────────────────────────────────────

export const inboundWorker = new Worker(
  'inbound-events',
  async (job) => {
    const {
      platform,
      orgId,
      integrationId,
      senderId,
      customerName,
      messageText,
      imageUrl,
      audioUrl,
      audioMediaId,
      platformMessageId,
    } = job.data;

    // 1. Idempotency Guard: Skip if this exact Meta message ID was already saved
    if (platformMessageId) {
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('org_id', orgId)
        .eq('platform_message_id', platformMessageId)
        .maybeSingle();

      if (existing) {
        console.log(`[INBOUND] Duplicate platformMessageId ${platformMessageId}, skipping.`);
        return { status: 'skipped', reason: 'duplicate' };
      }
    }

    let finalMessageText = messageText || '';
    let resolvedAudioUrl = audioUrl || null;

    // 2. Resolve Audio Media ID (for WhatsApp voice notes) & Transcribe with Groq
    const isVoicePlaceholder = !finalMessageText || finalMessageText === '[Voice message]';
    if (!resolvedAudioUrl && audioMediaId && isVoicePlaceholder) {
      resolvedAudioUrl = await resolveWhatsAppAudioUrl(orgId, integrationId, audioMediaId);
    }

    if (resolvedAudioUrl && isVoicePlaceholder) {
      try {
        const transcribed = await transcribeAudioWithGroq(resolvedAudioUrl);
        if (transcribed) finalMessageText = transcribed;
      } catch (err) {
        console.error('[AUDIO TRANSCRIBE ERROR]:', err.message);
      }
    }

    if (!finalMessageText && !imageUrl) {
      console.log(`[INBOUND WORKER] Empty message content for job ${job.id}, skipping.`);
      return { status: 'skipped', reason: 'empty_content' };
    }

    // 3. Get or Create Conversation Thread
    const conv = await getOrCreateConversation(
      orgId,
      platform,
      senderId,
      customerName || senderId,
      finalMessageText || '[Image]'
    );

    if (!conv) {
      throw new Error('Failed to get or create conversation');
    }

    // 4. Save Incoming Customer Message
    await insertMessageSafe({
      conversation_id: conv.id,
      org_id: orgId,
      sender: 'customer',
      content: finalMessageText || '[Image]',
      platform_message_id: platformMessageId || null,
      image_url: imageUrl || null,
      status: 'received',
      created_at: new Date().toISOString(),
    });

    // 5. Human Takeover Guard: Do not run AI if paused by a human agent in UnifiedInbox
    if (conv.ai_active === false) {
      console.log(`[AI PAUSED] Bot is paused by human agent for conversation ${conv.id}. Skipping bot reply.`);
      return { status: 'skipped', reason: 'human_takeover_active' };
    }

    // 6. Fetch Store Products & Chat History
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('org_id', orgId);

    const { data: chatHistory } = await supabase
      .from('messages')
      .select('sender, content, created_at')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (chatHistory || []).reverse().map((m) => ({
      role: m.sender === 'customer' ? 'user' : 'assistant',
      content: m.content || '',
      direction: m.sender === 'customer' ? 'incoming' : 'outgoing',
      message: m.content || '',
    }));

    // 7. Check Usage Limits & Call AI Agent
    let usage = { allowed: true };
    try {
      usage = await checkAndIncrementMetaUsage(orgId, senderId);
    } catch (e) {
      console.error('[USAGE CHECK ERROR]', e.message);
      usage = { allowed: false, reason: 'usage check failed' };
    }

    let aiResponse = null;
    if (!usage.allowed) {
      console.log(`[AI BLOCKED] Org ${orgId} reached Meta limit (${usage.reason})`);
      aiResponse = {
        reply: '⚠️ Limit reached! Please upgrade or renew your plan to continue using AI.',
        handover: true,
      };
    } else {
      aiResponse = await handleCustomerMessage({
        customerMessage: finalMessageText,
        orgId,
        storeProducts: products || [],
        conversationHistory,
        imageUrl: imageUrl || null,
      });
    }

    const isHandover = Boolean(aiResponse && aiResponse.handover);

    // 8. Send Handover Alert if Triggered
    if (isHandover) {
      await sendAlertToChannels(
        orgId,
        'notifyOnHandover',
        `🚨 *Human Assistance Requested!*\n*Platform:* ${platform.toUpperCase()}\n*Customer ID:* ${senderId}\n*Last Message:* "${finalMessageText}"\n\nPlease check the GROWCORE Unified Inbox to assist the customer.`
      );
    }

    let replyText =
      typeof aiResponse === 'string'
        ? aiResponse
        : aiResponse?.reply || 'Sorry, I could not process your request.';

    if (replyText) {
      replyText = replyText
        .replace(/•?\s*Image\s*\d*:\s*https?:\/\/\S+/gi, '')
        .replace(/https?:\/\/[^\s]+supabase\.co\/storage\S+/gi, '')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
    }

    // 9. Enqueue Outbound Text Reply
    if (replyText) {
      const payload =
        platform === 'whatsapp'
          ? { type: 'text', text: { body: replyText } }
          : { text: replyText };

      const savedMsg = await insertMessageSafe({
        conversation_id: conv.id,
        org_id: orgId,
        sender: 'bot',
        content: replyText,
        status: 'queued',
        created_at: new Date().toISOString(),
      });

      await enqueueOutboundMessage({
        platform,
        orgId,
        integrationId,
        recipientId: senderId,
        messagePayload: payload,
        messageId: savedMsg?.id || null,
        conversationId: conv.id,
        senderType: 'bot',
        isHandoverMessage: isHandover,
        priority: 1,
      });

      await supabase
        .from('conversations')
        .update({ last_message: replyText, updated_at: new Date().toISOString() })
        .eq('id', conv.id);
    }

    // 10. Enqueue Product Images (1 to max 6 images, only if matched in DB)
    const replyImage = typeof aiResponse === 'object' ? aiResponse?.image_url : null;
    if (replyImage) {
      const matchedProd = (products || []).find(
        (p) =>
          p.image_url === replyImage ||
          (typeof p.images === 'string' && p.images.includes(replyImage)) ||
          (Array.isArray(p.images) && p.images.includes(replyImage))
      );

      if (!matchedProd) {
        console.warn(`[IMAGE] AI returned image not found in store products, skipping: ${replyImage}`);
      } else {
        let imagesToSend = [];
        const rawImages = matchedProd.images || matchedProd.image_url || replyImage;

        if (Array.isArray(rawImages)) {
          imagesToSend = rawImages;
        } else if (typeof rawImages === 'string') {
          const trimmed = rawImages.trim();
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try {
              imagesToSend = JSON.parse(trimmed);
            } catch (e) {
              imagesToSend = [trimmed];
            }
          } else if (trimmed.includes(',')) {
            imagesToSend = trimmed.split(',').map((u) => u.trim()).filter(Boolean);
          } else {
            imagesToSend = [trimmed];
          }
        }

        imagesToSend = imagesToSend.slice(0, 6);

        for (let i = 0; i < imagesToSend.length; i++) {
          const imgUrl = imagesToSend[i];
          const cleanUrl = typeof imgUrl === 'string' ? imgUrl : imgUrl?.src || imgUrl?.url;

          if (cleanUrl && cleanUrl.startsWith('http')) {
            const imagePayload =
              platform === 'whatsapp'
                ? { type: 'image', image: { link: cleanUrl } }
                : {
                    attachment: {
                      type: 'image',
                      payload: { url: cleanUrl, is_reusable: true },
                    },
                  };

            await enqueueOutboundMessage({
              platform,
              orgId,
              integrationId,
              recipientId: senderId,
              messagePayload: imagePayload,
              conversationId: conv.id,
              senderType: 'bot',
              isHandoverMessage: isHandover,
              priority: 2,
              delay: (i + 1) * 350,
            });
          }
        }
      }
    }

    // 11. Dynamic Order Creation
    if (aiResponse && aiResponse.orderData) {
      const orderData = aiResponse.orderData;
      const generatedOrderId = `ORD-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const finalCustomerName =
        orderData.customer_name ||
        orderData.customerName ||
        orderData.name ||
        orderData.fullName ||
        customerName ||
        'Valued Customer';
      const finalPhone =
        orderData.phone_number || orderData.phone || orderData.customer_phone || senderId;
      const finalAddress =
        orderData.delivery_address || orderData.address || orderData.shipping_address || null;

      const quantity = parseInt(orderData.product_quantity || orderData.quantity || 1, 10);
      const finalTotal = parseFloat(orderData.totalPrice || orderData.total_amount || 0) || 0;
      const deliveryCharge = parseFloat(orderData.delivery_charge || 0) || 0;

      const coreKeys = new Set([
        'customer_name', 'customerName', 'name', 'fullName',
        'phone_number', 'phone', 'customer_phone',
        'delivery_address', 'address', 'shipping_address',
        'product_quantity', 'quantity',
        'product_title', 'product_name', 'products', 'orderedProducts',
        'totalPrice', 'total_amount', 'delivery_charge',
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

      let finalProducts =
        orderData.product_title || orderData.product_name || orderData.products;
      if (!finalProducts) {
        const fallbackName =
          Array.isArray(products) && products.length > 0
            ? products[0].title || products[0].name
            : 'Ordered Product';
        const variantSuffix = variantSpecs.length > 0 ? ` (${variantSpecs.join(', ')})` : '';
        finalProducts = `${quantity}x ${fallbackName}${variantSuffix}`;
      }

      const { error: orderInsertErr } = await supabase.from('orders').insert([
        {
          org_id: orgId,
          order_id: generatedOrderId,
          customer_name: finalCustomerName,
          customer_phone: finalPhone,
          address: finalAddress,
          products: finalProducts,
          total_amount: finalTotal,
          status: 'pending',
          custom_details: dynamicCustomDetails,
          delivery_charge: deliveryCharge,
        },
      ]);

      if (orderInsertErr) {
        console.error('[ORDER INSERT ERROR]:', orderInsertErr.message);
      }

      try {
        await syncOrderToShopify(orgId, orderData);
      } catch (shopifyErr) {
        console.warn('[SHOPIFY SYNC WARNING]:', shopifyErr.message);
      }

      try {
        const alertMsg = `🛍️ New Order Received (${platform.toUpperCase()})!\n🆔 Order: ${generatedOrderId}\n👤 Customer: ${finalCustomerName}\n📞 Phone: ${finalPhone || 'N/A'}\n📦 Items: ${finalProducts}\n💰 Total: ${finalTotal}`;
        await sendAlertToChannels(orgId, 'notifyOnOrderUpdate', alertMsg);
      } catch (alertErr) {
        console.warn('[ALERT CHANNELS WARNING]:', alertErr.message);
      }
    }

    return { status: 'processed', senderId };
  },
  {
    connection: redisWorkerConnection,
    concurrency: 5,
    lockDuration: 120000,
    stalledInterval: 30000,
    maxStalledCount: 1,
  }
);

inboundWorker.on('completed', (job) => {
  console.log(`[INBOUND WORKER COMPLETED] Job ${job.id} processed successfully.`);
});

inboundWorker.on('failed', (job, err) => {
  console.error(`[INBOUND WORKER FAILED] Job ${job?.id} failed: ${err.message}`);
});

inboundWorker.on('error', (err) => {
  console.error(`[INBOUND WORKER ERROR] ${err.message}`);
});

async function gracefulShutdown(signal) {
  console.log(`[INBOUND WORKER] Received ${signal}, closing inboundWorker...`);
  try {
    await inboundWorker.close();
    console.log('[INBOUND WORKER] Closed gracefully');
  } catch (e) {
    console.error(`[INBOUND WORKER] Shutdown error: ${e.message}`);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default inboundWorker;