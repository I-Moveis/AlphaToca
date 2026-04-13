import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { WhatsAppWebhookPayload } from '../types/whatsapp';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// BullMQ recommends maxRetriesPerRequest: null in IORedis connections
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const messageQueue = new Queue<WhatsAppWebhookPayload>('whatsapp-messages', {
    connection,
});
