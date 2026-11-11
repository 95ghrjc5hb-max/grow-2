import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const isProduction = process.env.NODE_ENV === 'production';
const rawRedisUrl = process.env.REDIS_URL;

// 1. Production Guard: প্রোডাকশনে REDIS_URL না থাকলে বা localhost হলে সাথে সাথে থামবে
if (isProduction && !rawRedisUrl) {
  console.error('[FATAL CONFIG ERROR] REDIS_URL is missing in production environment!');
  process.exit(1);
}

const redisUrl = rawRedisUrl || 'redis://127.0.0.1:6379';

if (isProduction && (redisUrl.includes('127.0.0.1') || redisUrl.includes('localhost'))) {
  console.error('[FATAL CONFIG ERROR] REDIS_URL points to localhost in production!');
  process.exit(1);
}

if (!isProduction && !rawRedisUrl) {
  console.warn('[REDIS] REDIS_URL not set, falling back to redis://127.0.0.1:6379 for local dev');
}

const isTls = redisUrl.startsWith('rediss://');

/**
 * Shared Redis Connection Factory
 * - Never returns null in retryStrategy so production workers auto-recover after Redis restarts
 * - Supports both TCP (redis://) and TLS (rediss://) on Railway
 */
export function createRedisConnection(name) {
  const conn = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectionName: name,
    ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    retryStrategy(times) {
      // সর্বোচ্চ ৫ সেকেন্ড বিরতিতে রিকানেক্ট চেষ্টা চালিয়ে যাবে, কখনোই কানেকশন স্থায়ীভাবে ডেড করবে না
      const delay = Math.min(times * 500, 5000);
      if (times % 10 === 0) {
        console.warn(`[REDIS RETRY] ${name} attempting reconnect (attempt #${times})...`);
      }
      return delay;
    },
  });

  conn.on('connect', () => {
    console.log(`[REDIS CONNECTED] ${name} connected (${isTls ? 'TLS/rediss' : 'TCP/redis'}).`);
  });

  conn.on('error', (err) => {
    console.error(`[REDIS ERROR] ${name}:`, err.message);
  });

  return conn;
}

// Queue (Producer) এর জন্য কানেকশন
export const redisConnection = createRedisConnection('grow2-queue');

// Worker (Consumer) এর জন্য আলাদা ব্লকিং কানেকশন
export const redisWorkerConnection = createRedisConnection('grow2-worker');

/**
 * Inbound Events Queue
 * Meta ওয়েববুক থেকে রিসিভ করা মেসেজ তাৎক্ষণিকভাবে এখানে জমা হবে যাতে HTTP 200 দ্রুত রিটার্ন হয়
 */
export const inboundQueue = new Queue('inbound-events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
      jitter: 0.2,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Outbound Messages Queue
 * মেটা ক্লাউড এপিআইতে (WhatsApp, Messenger, Instagram) মেসেজ ডিসপ্যাচ করার কিউ
 */
export const outboundQueue = new Queue('outbound-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1500,
      jitter: 0.2,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Graceful Shutdown Helper
 */
export async function closeRedisConnections() {
  try {
    await inboundQueue.close();
  } catch (e) {}
  try {
    await outboundQueue.close();
  } catch (e) {}
  try {
    await redisConnection.quit();
  } catch (e) {}
  try {
    await redisWorkerConnection.quit();
  } catch (e) {}
}