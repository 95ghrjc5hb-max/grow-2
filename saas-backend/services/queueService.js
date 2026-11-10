import { outboundQueue } from '../config/queue.js';

/**
 * Enqueue an outbound Meta message into BullMQ.
 * 
 * Strict Multi-Tenant Rule:
 * Never pass accessToken or credentials in the job payload.
 * The worker retrieves fresh credentials securely using (orgId, integrationId).
 * 
 * @param {Object} params
 * @param {'whatsapp'|'messenger'|'instagram'} params.platform
 * @param {string} params.orgId - Tenant Organization UUID
 * @param {string} params.integrationId - Database Integration UUID
 * @param {string} params.recipientId - Recipient Phone Number or PSID / IGSID
 * @param {Object} params.messagePayload - Formatted Meta message object
 * @param {number} [params.priority=1] - 1 = High (Live Chat reply), 2 = Standard, 3 = Bulk/Campaign
 */
export const enqueueOutboundMessage = async ({
  platform,
  orgId,
  integrationId,
  recipientId,
  messagePayload,
  priority = 1,
}) => {
  if (!platform || !orgId || !integrationId || !recipientId || !messagePayload) {
    throw new Error('[QUEUE ENQUEUE ERROR] Missing required parameters for outbound dispatch');
  }

  // BullMQ-তে জব অ্যাড করা
  const job = await outboundQueue.add(
    `send-${platform}`,
    {
      platform,
      orgId,
      integrationId,
      recipientId,
      messagePayload,
    },
    {
      priority, // লোয়ার নাম্বার = হায়ার প্রায়োরিটি (1 আগে প্রসেস হবে)
    }
  );

  console.log(`[QUEUE ENQUEUED] Job ID: ${job.id} | Platform: ${platform} | Recipient: ${recipientId}`);
  return job;
};