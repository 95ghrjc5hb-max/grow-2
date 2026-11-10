import { Worker } from 'bullmq';
import axios from 'axios';
import { redisConnection } from '../config/queue.js';
import { supabase } from '../config/supabase.js';

// স্থায়ী মেটা এরর কোড (যেগুলো রিট্রাই করা সম্পূর্ণ অর্থহীন)
// 131047: Re-engagement message (24-hr window expired)
// 131030: Recipient phone number not in allowed list
// 132000: Template parameter count mismatch
// 190: Access token expired or invalidated
const PERMANENT_META_ERROR_CODES = new Set([131047, 131030, 132000, 190]);

export const outboundWorker = new Worker(
  'outbound-messages',
  async (job) => {
    const { platform, orgId, integrationId, recipientId, messagePayload } = job.data;

    // ১. টেন্যান্ট আইসোলেশন ও ক্রেডেনশিয়াল রিট্রিভাল
    const { data: integration, error: dbError } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', integrationId)
      .single();

    if (dbError || !integration || !integration.access_token) {
      console.error(`[WORKER AUTH ERROR] Failed to fetch credentials for Org: ${orgId}, Integration: ${integrationId}`);
      // ক্রেডেনশিয়াল ডাটাবেস থেকে মুছে গেলে রিট্রাই থামিয়ে দেবে
      return { status: 'aborted', reason: 'Integration or credentials missing' };
    }

    const accessToken = integration.access_token;
    let endpoint = '';
    let requestPayload = {};

    // ২. প্ল্যাটফর্ম অনুযায়ী পেলোড ও এন্ডপয়েন্ট প্রস্তুতকরণ
    if (platform === 'whatsapp') {
      const activePhoneId = integration.phone_number_id || integration.page_id;
      endpoint = `https://graph.facebook.com/v21.0/${activePhoneId}/messages`;
      requestPayload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientId,
        ...messagePayload,
      };
    } else if (platform === 'messenger' || platform === 'instagram') {
      const pageId = integration.page_id;
      const isInstagram = platform === 'instagram';
      const baseUrl = isInstagram ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
      endpoint = `${baseUrl}/${pageId}/messages`;
      requestPayload = {
        recipient: { id: recipientId },
        message: messagePayload,
      };
    } else {
      console.warn(`[WORKER UNKNOWN PLATFORM] Unsupported platform: ${platform}`);
      return { status: 'skipped', reason: 'Unsupported platform' };
    }

    // ৩. মেটা ক্লাউড এপিআইতে ডিসপ্যাচ
    try {
      const response = await axios.post(endpoint, requestPayload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // ১০ সেকেন্ডের সিকিউর নেটওয়ার্ক টাইমআউট গার্ড
      });

      console.log(`[OUTBOUND SUCCESS] [${platform.toUpperCase()}] Job ${job.id} dispatched to ${recipientId}`);
      return response.data;
    } catch (error) {
      const metaError = error.response?.data?.error;
      const errorCode = metaError?.code;
      const errorSubcode = metaError?.error_subcode;
      const httpStatus = error.response?.status;

      console.error(`[OUTBOUND ERROR] Job ${job.id} failed. HTTP ${httpStatus} | Meta Code: ${errorCode} | Subcode: ${errorSubcode} | Message: ${metaError?.message || error.message}`);

      // স্থায়ী ভায়োলেশন হলে রিট্রাই ড্রপ করবে
      if (PERMANENT_META_ERROR_CODES.has(errorCode)) {
        console.warn(`[PERMANENT DISCARD] Job ${job.id} dropped permanently. Meta Error Code: ${errorCode}`);
        return { status: 'discarded', errorCode, reason: metaError?.message };
      }

      // রিট্রাইয়েবল এরর (429 Rate Limit, 5xx Meta Server Error, Network Drop)
      // এরর থ্রো করলে BullMQ কনফিগার করা 1500ms এক্সপোনেনশিয়াল ব্যাকঅফ অনুযায়ী রিট্রাই চালাবে
      throw new Error(`Meta Dispatch Error [${errorCode || httpStatus || 'NETWORK'}]: ${metaError?.message || error.message}`);
    }
  },
  {
    connection: redisConnection,
    concurrency: 10, // একযোগে ১০টি মেসেজ প্রসেস হবে
    limiter: {
      max: 20, // মেটার স্প্যাম গার্ড: প্রতি সেকেন্ডে সর্বোচ্চ ২০টি মেসেজ
      duration: 1000,
    },
  }
);

outboundWorker.on('completed', (job) => {
  // কমপ্লিট হওয়া লগিং (ডিবাগ সুবিধার জন্য)
});

outboundWorker.on('failed', (job, err) => {
  if (job?.attemptsMade >= job?.opts?.attempts) {
    console.error(`[EXHAUSTED RETRIES] Job ${job.id} permanently failed after ${job.opts.attempts} attempts. Error: ${err.message}`);
  }
});