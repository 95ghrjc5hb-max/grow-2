import crypto from 'node:crypto';
import { inboundQueue, outboundQueue } from '../config/queue.js';

const VALID_PLATFORMS = ['whatsapp', 'messenger', 'instagram'];

function sanitizeJobIdPart(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

/**
 * 10-second window hash for jobs without a database ID.
 * Prevents instant duplicate enqueues while allowing the same message/image
 * to be sent to the same user again later.
 */
function hashPayloadWithWindow(payload) {
  try {
    const timeBucket = Math.floor(Date.now() / 10000); // 10s deduplication window
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...payload, timeBucket }))
      .digest('hex')
      .slice(0, 16);
  } catch (e) {
    return `${Date.now()}`;
  }
}

function normalizePriority(priority) {
  const p = Number.parseInt(priority, 10);
  if (Number.isNaN(p)) return 1;
  return Math.min(Math.max(p, 1), 10);
}

function sanitizeRawEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== 'object') return null;
  const copy = { ...rawEvent };
  delete copy.access_token;
  delete copy.accessToken;
  delete copy.token;
  delete copy.signature;
  delete copy.app_secret;
  const str = JSON.stringify(copy);
  if (str.length > 5000) return { _truncated: true, _len: str.length };
  return copy;
}

/**
 * Enqueue an inbound webhook event
 */
export const enqueueInboundEvent = async ({
  platform,
  orgId,
  integrationId,
  senderId,
  customerName,
  messageText,
  imageUrl = null,
  audioUrl = null,
  audioMediaId = null,
  platformMessageId = null,
  rawEvent = null,
}) => {
  if (!platform || !orgId || !integrationId || !senderId) {
    throw new Error('[INBOUND ENQUEUE ERROR] Missing required parameters for inbound event');
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new Error(`[INBOUND ENQUEUE ERROR] Invalid platform: ${platform}`);
  }

  // Idempotent Job ID: orgId সহ যাতে মাল্টি-টেন্যান্ট কলিশন না হয়
  let jobId;
  if (platformMessageId) {
    jobId = `in-${sanitizeJobIdPart(orgId)}-${platform}-${sanitizeJobIdPart(platformMessageId)}`;
  } else {
    const fallback = hashPayloadWithWindow({ senderId, messageText, imageUrl });
    jobId = `in-${sanitizeJobIdPart(orgId)}-${platform}-noid-${fallback}`;
  }

  const job = await inboundQueue.add(
    `process-${platform}`,
    {
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
      rawEvent: sanitizeRawEvent(rawEvent),
      receivedAt: new Date().toISOString(),
    },
    { jobId }
  );

  console.log(`[INBOUND ENQUEUED] Job ID: ${job.id} | Platform: ${platform} | Sender: ${senderId}`);
  return job;
};

/**
 * Enqueue an outbound Meta message into BullMQ.
 * Never pass accessToken in job payload. Worker fetches from DB by orgId + integrationId.
 */
export const enqueueOutboundMessage = async ({
  platform,
  orgId,
  integrationId,
  recipientId,
  messagePayload,
  messageId = null,
  conversationId = null,
  senderType = 'bot',
  isHandoverMessage = false,
  priority = 1,
  delay = 0,
}) => {
  if (!platform || !orgId || !integrationId || !recipientId || !messagePayload) {
    throw new Error('[QUEUE ENQUEUE ERROR] Missing required parameters for outbound dispatch');
  }
  if (!VALID_PLATFORMS.includes(platform)) {
    throw new Error(`[QUEUE ENQUEUE ERROR] Invalid platform: ${platform}`);
  }

  if (senderType === 'bot' && !isHandoverMessage && !conversationId) {
    console.warn(
      `[QUEUE WARN] Bot message without conversationId, human-takeover check will be skipped. Org: ${orgId} Recipient: ${recipientId}`
    );
  }

  const safePriority = normalizePriority(priority);
  const safeDelay = typeof delay === 'number' && delay > 0 ? Math.floor(delay) : 0;

  // Idempotent Job ID: messageId থাকলে স্থায়ী আইডি, না থাকলে ১০ সেকেন্ডের উইন্ডো হ্যাশ
  let jobId;
  if (messageId) {
    jobId = `out-${sanitizeJobIdPart(orgId)}-${platform}-${sanitizeJobIdPart(messageId)}`;
  } else {
    const fallback = hashPayloadWithWindow({ recipientId, messagePayload });
    jobId = `out-${sanitizeJobIdPart(orgId)}-${platform}-noid-${fallback}`;
  }

  const bypassHumanTakeover = senderType === 'human' || isHandoverMessage === true;

  const job = await outboundQueue.add(
    `send-${platform}`,
    {
      platform,
      orgId,
      integrationId,
      recipientId,
      messagePayload,
      messageId,
      conversationId,
      senderType,
      isHandoverMessage,
      bypassHumanTakeover,
      enqueuedAt: new Date().toISOString(),
    },
    {
      priority: safePriority,
      ...(safeDelay > 0 ? { delay: safeDelay } : {}),
      jobId,
    }
  );

  console.log(`[QUEUE ENQUEUED] Job ID: ${job.id} | Platform: ${platform} | Recipient: ${recipientId}`);
  return job;
};