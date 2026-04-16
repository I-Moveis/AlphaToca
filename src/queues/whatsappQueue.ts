import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { WhatsAppWebhookPayload } from '../types/whatsapp';

if (!process.env.REDIS_URL) {
    throw new Error('[Queue] REDIS_URL não definida no ambiente. A fila não pode iniciar sem uma conexão Redis configurada.');
}

const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

export const messageQueue = new Queue<WhatsAppWebhookPayload>('whatsapp-messages', {
    connection,
    defaultJobOptions: {
        attempts: 1,
    },
});
