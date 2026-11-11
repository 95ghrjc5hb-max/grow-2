import { Worker, UnrecoverableError } from 'bullmq';
import axios from 'axios';
import { redisConnection } from '../config/queue.js';
import { supabase } from '../config/supabase.js';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// 131047: 24h window expired | 131030/131031: Recipient not allowed | 132000: Template mismatch
// 131026: Undeliverable | 131051: Unsupported msg type | 131042: WABA payment issue | 10, 200: Permission/Block
const PERMANENT_META_ERROR_CODES = new Set([
  131047, 131030, 131031, 132000, 131026, 131051, 131042, 10, 200,
]);

// শুধুমাত্র টোকেন নষ্ট বা মেয়াদোত্তীর্ণ হলেই ইনটিগ্রেশন needs_reauth হবে
const AUTH_ERROR_CODES = new Set([190, 191, 102]);

// Meta rate limit + temporary throttling
const RETRYABLE_META_ERROR_CODES = new Set([130429, 80007, 4, 17, 32, 613]);
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normalizeMessengerPayload(messagePayload) {
  if (!messagePayload) return { text: '' };
  if (typeof messagePayload === 'string') return { text: messagePayload };
  if (typeof messagePayload.text === 'string') return { text: messagePayload.text };
  if (messagePayload.text?.body) return { text: messagePayload.text.body };
  if (messagePayload.type === 'image' && messagePayload.image?.link) {
    return {
      attachment: {
        type: 'image',
        payload: { url: messagePayload.image.link, is_reusable: true },
      },
    };
  }
  if (messagePayload.type === 'video' && messagePayload.video?.link) {
    return {
      attachment: {
        type: 'video',
        payload: { url: messagePayload.video.link, is_reusable: true },
      },
    };
  }
  if (messagePayload.type === 'audio' && messagePayload.audio?.link) {
    return {
      attachment: {
        type: 'audio',
        payload: { url: messagePayload.audio.link, is_reusable: true },
      },
    };
  }
  if (messagePayload.type === 'file' && messagePayload.file?.link) {
    return {
      attachment: {
        type: 'file',
        payload: { url: messagePayload.file.link, is_reusable: true },
      },
    };
  }
  if (messagePayload.attachment) return messagePayload;
  if (messagePayload.template) return messagePayload;
  return messagePayload;
}

function normalizeWhatsAppPayload(messagePayload) {
  if (!messagePayload) return { type: 'text', text: { body: '' } };
  if (messagePayload.type) return messagePayload;
  if (typeof messagePayload === 'string') return { type: 'text', text: { body: messagePayload } };
  if (typeof messagePayload.text === 'string') return { type: 'text', text: { body: messagePayload.text } };
  if (messagePayload.text?.body) return { type: 'text', text: { body: messagePayload.text.body } };
  if (messagePayload.template) return { type: 'template', template: messagePayload.template };
  return messagePayload;
}

async function markIntegrationNeedsReauth(orgId, integrationId, reason) {
  try {
    const { error } = await supabase
      .from('integrations')
      .update({ status: 'needs_reauth', last_error: reason, updated_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('id', integrationId);

    if (error) {
      await supabase
        .from('integrations')
        .update({ status: 'needs_reauth', updated_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('id', integrationId);
    }
    console.error(`[AUTH] Integration ${integrationId} marked needs_reauth: ${reason}`);
  } catch (e) {
    console.error(`[AUTH] Failed to mark needs_reauth: ${e.message}`);
  }
}

async function updateOutboundMessageStatus(messageId, patch) {
  if (!messageId) return;
  try {
    const { error } = await supabase.from('messages').update(patch).eq('id', messageId);
    if (error) {
      // যদি নতুন কলাম (যেমন sent_at বা error) এখনও মাইগ্রেট না হয়ে থাকে, তবে শুধু platform_message_id আপডেট করবে
      if (patch.platform_message_id) {
        await supabase
          .from('messages')
          .update({ platform_message_id: patch.platform_message_id })
          .eq('id', messageId);
      }
    }
  } catch (e) {
    console.error(`[MSG-STATUS] Failed to update ${messageId}: ${e.message}`);
  }
}

async function checkAlreadySent(messageId) {
  if (!messageId) return null;
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('id', messageId)
      .maybeSingle();

    if (error || !data) return null;
    const existingProviderId = data.platform_message_id || data.provider_message_id;
    if ((data.status === 'sent' || data.status === 'delivered' || data.status === 'read') && existingProviderId) {
      return { providerMessageId: existingProviderId };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function checkHumanTakeover(conversationId) {
  if (!conversationId) return false;
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('ai_active')
      .eq('id', conversationId)
      .maybeSingle();
    if (error) return false;
    return data?.ai_active === false;
  } catch (e) {
    return false;
  }
}

// ─── WORKER ──────────────────────────────────────────────────────────────────

export const outboundWorker = new Worker(
  'outbound-messages',
  async (job) => {
    const {
      platform,
      orgId,
      integrationId,
      recipientId,
      messagePayload,
      messageId,
      conversationId,
      senderType = 'bot',
      isHandoverMessage = false,
    } = job.data;

    if (!platform || !orgId || !integrationId || !recipientId || !messagePayload) {
      await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Missing required job parameters' });
      throw new UnrecoverableError(
        `Missing job data: platform=${platform} orgId=${orgId} integrationId=${integrationId} recipientId=${recipientId}`
      );
    }

    // 1. Idempotency Check: আগেই সেন্ড হয়ে থাকলে ডুপ্লিকেট পাঠাবে না
    const alreadySent = await checkAlreadySent(messageId);
    if (alreadySent) {
      console.log(`[WORKER] Job ${job.id} already sent, skipping duplicate. ProviderMsgId: ${alreadySent.providerMessageId}`);
      return { status: 'already_sent', providerMessageId: alreadySent.providerMessageId, platform };
    }

    // 2. Human Takeover Guard: শুধুমাত্র সাধারণ বট রিপ্লাই হলে এবং হিউম্যান টেকওভার চালু থাকলে স্কিপ করবে
    // (হিউম্যান এজেন্টের নিজের মেসেজ বা বটের শেষ হ্যান্ডওভার অ্যালার্ট মেসেজ ব্লক হবে না)
    if (senderType === 'bot' && !isHandoverMessage && conversationId) {
      const humanTookOver = await checkHumanTakeover(conversationId);
      if (humanTookOver) {
        console.log(`[WORKER] Job ${job.id} skipped, human takeover active for conversation ${conversationId}`);
        await updateOutboundMessageStatus(messageId, { status: 'skipped', error: 'Human takeover active' });
        return { status: 'skipped_human_takeover', conversationId };
      }
    }

    // 3. Fetch Integration Credentials
    const { data: integration, error: dbError } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', integrationId)
      .maybeSingle();

    if (dbError) {
      console.error(`[WORKER] Transient DB error for Org:${orgId} Integration:${integrationId} - will retry. Error: ${dbError.message}`);
      throw new Error(`DB_FETCH_FAILED: ${dbError.message}`);
    }

    const accessToken = integration?.access_token || integration?.accessToken;

    if (!integration || !accessToken) {
      console.error(`[WORKER] Integration missing or no token. Org:${orgId} Integration:${integrationId}`);
      await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Integration or credentials missing' });
      throw new UnrecoverableError(`Integration ${integrationId} missing or has no token`);
    }

    if (
      integration.status === 'disconnected' ||
      integration.status === 'needs_reauth' ||
      integration.is_connected === false ||
      integration.is_active === false
    ) {
      const stateReason = integration.status || 'disconnected';
      console.error(`[WORKER] Integration ${integrationId} is ${stateReason}, skipping send`);
      await updateOutboundMessageStatus(messageId, { status: 'failed', error: `Integration ${stateReason}` });
      throw new UnrecoverableError(`Integration ${integrationId} is ${stateReason}`);
    }

    const expiresAt = integration.token_expires_at || integration.tokenExpiresAt;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      console.error(`[WORKER] Token expired for Integration ${integrationId} at ${expiresAt}`);
      await markIntegrationNeedsReauth(orgId, integrationId, `Access token expired at ${expiresAt}`);
      await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Access token expired' });
      throw new UnrecoverableError(`Access token expired for Integration ${integrationId}`);
    }

    let endpoint = '';
    let requestPayload = {};

    // 4. Platform & Dual-Auth Endpoint Construction
    if (platform === 'whatsapp') {
      // আপনার webhookController অনুযায়ী phoneNumberId থাকে phone_number_id অথবা page_id কলামে
      const phoneNumberId =
        integration.phone_number_id ||
        integration.phoneNumberId ||
        integration.page_id ||
        integration.pageId;

      if (!phoneNumberId) {
        await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Missing phone_number_id' });
        throw new UnrecoverableError(`WhatsApp Integration ${integrationId} is missing phone_number_id`);
      }

      endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
      requestPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        ...normalizeWhatsAppPayload(messagePayload),
      };
    } else if (platform === 'messenger') {
      const pageId = integration.page_id || integration.pageId;
      if (!pageId) {
        await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Missing page_id' });
        throw new UnrecoverableError(`Messenger Integration ${integrationId} is missing page_id`);
      }

      endpoint = `https://graph.facebook.com/v21.0/${pageId}/messages`;
      requestPayload = {
        recipient: { id: recipientId },
        message: normalizeMessengerPayload(messagePayload),
      };
    } else if (platform === 'instagram') {
      const authType = integration.auth_type || integration.authType;
      const igUserId =
        integration.ig_user_id ||
        integration.igUserId ||
        integration.instagram_id ||
        integration.account_id ||
        integration.accountId;
      const pageId = integration.page_id || integration.pageId;

      // আপনার metaGraphService.js অনুযায়ী IG Direct Token চেনার উপায়
      const isDirectIgToken =
        accessToken.startsWith('IG') || (accessToken.length < 180 && !accessToken.startsWith('EAA'));

      if (authType === 'instagram_login' || isDirectIgToken || (!pageId && igUserId)) {
        // Dual-Auth Flow 1: Instagram Direct Login (No Facebook Page needed)
        const targetIgId = igUserId || pageId || 'me';
        endpoint = `https://graph.instagram.com/v21.0/${targetIgId}/messages`;
        requestPayload = {
          recipient: { id: recipientId },
          message: normalizeMessengerPayload(messagePayload),
        };
      } else {
        // Dual-Auth Flow 2: Facebook Login (Page-linked Instagram)
        if (!pageId) {
          await updateOutboundMessageStatus(messageId, { status: 'failed', error: 'Missing page_id' });
          throw new UnrecoverableError(`Instagram (Facebook Login) Integration ${integrationId} is missing page_id`);
        }
        endpoint = `https://graph.facebook.com/v21.0/${pageId}/messages`;
        requestPayload = {
          recipient: { id: recipientId },
          message: normalizeMessengerPayload(messagePayload),
        };
      }
    } else {
      console.warn(`[WORKER] Unsupported platform: ${platform}`);
      await updateOutboundMessageStatus(messageId, { status: 'failed', error: `Unsupported platform: ${platform}` });
      throw new UnrecoverableError(`Unsupported platform: ${platform}`);
    }

    // 5. Dispatch to Meta Graph API
    try {
      const response = await axios.post(endpoint, requestPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const providerMessageId = response.data?.messages?.[0]?.id || response.data?.message_id || null;
      console.log(
        `[OUTBOUND SUCCESS] [${platform.toUpperCase()}] Org:${orgId} Job ${job.id} dispatched to ${recipientId} | ProviderMsgId: ${providerMessageId}`
      );

      if (messageId) {
        await updateOutboundMessageStatus(messageId, {
          status: 'sent',
          platform_message_id: providerMessageId,
          sent_at: new Date().toISOString(),
        });
      }

      return { status: 'sent', providerMessageId, platform };
    } catch (error) {
      const metaError = error.response?.data?.error;
      const errorCode = metaError?.code;
      const errorSubcode = metaError?.error_subcode;
      const httpStatus = error.response?.status;
      const retryAfter = error.response?.headers?.['retry-after'] || error.response?.headers?.['Retry-After'];

      console.error(
        `[OUTBOUND ERROR] Job ${job.id} failed. HTTP ${httpStatus || 'NET_ERR'} | Meta Code: ${errorCode} | Subcode: ${errorSubcode} | Retry-After: ${retryAfter || 'N/A'} | Msg: ${metaError?.message || error.message}`
      );

      // A. AUTH ERROR (190, 191, 102, 401, 403)
      if (AUTH_ERROR_CODES.has(errorCode) || httpStatus === 401 || httpStatus === 403) {
        await markIntegrationNeedsReauth(
          orgId,
          integrationId,
          `Meta ${errorCode || httpStatus}: ${metaError?.message || error.message}`
        );
        await updateOutboundMessageStatus(messageId, {
          status: 'failed',
          error: `Auth failed: ${metaError?.message || error.message}`,
        });
        throw new UnrecoverableError(
          `Auth failed for Integration ${integrationId}: ${metaError?.message || error.message}`
        );
      }

      // B. PERMANENT ERROR
      if (PERMANENT_META_ERROR_CODES.has(errorCode)) {
        console.log(`[WORKER] Permanent error ${errorCode}, discarding job ${job.id} without retry`);
        await updateOutboundMessageStatus(messageId, {
          status: 'failed',
          error: `Permanent (${errorCode}): ${metaError?.message}`,
        });
        throw new UnrecoverableError(`Permanent Meta Error ${errorCode}: ${metaError?.message}`);
      }

      // C. RETRYABLE - Meta rate limit + HTTP 5xx + Network drop
      if (
        RETRYABLE_META_ERROR_CODES.has(errorCode) ||
        RETRYABLE_HTTP_STATUS.has(httpStatus) ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET' ||
        !error.response
      ) {
        if (job.attemptsMade + 1 >= (job.opts?.attempts || 5)) {
          await updateOutboundMessageStatus(messageId, {
            status: 'failed',
            error: `Max retries exhausted: ${metaError?.message || error.message}`,
          });
        }
        throw new Error(
          `Retryable Meta Error: HTTP ${httpStatus} Code ${errorCode} - ${metaError?.message || error.message}`
        );
      }

      // D. 400 / 404 Bad Request
      if (httpStatus === 400 || httpStatus === 404) {
        await updateOutboundMessageStatus(messageId, {
          status: 'failed',
          error: metaError?.message || error.message,
        });
        throw new UnrecoverableError(`Invalid request (${httpStatus}): ${metaError?.message || error.message}`);
      }

      throw new Error(`Meta Dispatch Error: ${errorCode} | HTTP ${httpStatus} | ${metaError?.message || error.message}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 10,
    limiter: { max: 20, duration: 1000 },
  }
);

outboundWorker.on('completed', (job) => {
  console.log(`[WORKER COMPLETED] Job ${job.id} completed`);
});

outboundWorker.on('failed', (job, err) => {
  console.error(
    `[WORKER FAILED] Job ${job?.id} failed (Attempt ${job?.attemptsMade}/${job?.opts?.attempts}). Reason: ${err.message}`
  );
});

outboundWorker.on('error', (err) => {
  console.error(`[WORKER ERROR] ${err.message}`);
});

async function gracefulShutdown(signal) {
  console.log(`[WORKER] Received ${signal}, closing outboundWorker...`);
  try {
    await outboundWorker.close();
    console.log('[WORKER] Outbound worker closed gracefully');
  } catch (e) {
    console.error(`[WORKER] Shutdown error: ${e.message}`);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default outboundWorker;