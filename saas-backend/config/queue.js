import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * Shared Redis connection instance for BullMQ.
 * maxRetriesPerRequest MUST be set to null for BullMQ compatibility.
 */
export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 3000);
    return delay;
  },
});

redisConnection.on('connect', () => {
  console.log('[REDIS CONNECTED] Successfully established connection to Redis.');
});

redisConnection.on('error', (err) => {
  console.error('[REDIS ERROR] Redis connection error:', err.message);
});

/**
 * Outbound Messages Queue
 * Configured per Grow-2 architectural requirements:
 * - 5 attempts
 * - Exponential retry starting at 1500ms
 * - Completed jobs pruned at 1,000
 * - Failed jobs retained up to 5,000 for debugging
 */
export const outboundQueue = new Queue('outbound-messages', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1500, // 1.5s, 3s, 6s, 12s, 24s
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});