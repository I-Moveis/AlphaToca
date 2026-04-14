import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { WhatsAppWebhookPayload } from '../types/whatsapp';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

export const whatsappWorker = new Worker<WhatsAppWebhookPayload>(
    'whatsapp-messages',
    async (job: Job<WhatsAppWebhookPayload>) => {
        const payload = job.data;
        console.log(`\x1b[32m[Worker]\x1b[0m Processando nova mensagem do WhatsApp!`);
        console.log(`\x1b[36m[Worker Data]\x1b[0m Object: ${payload.object}, Entries: ${payload.entry.length}`);
        
        // Simulando tempo de leitura e processamento RAG
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return { success: true, timestamp: new Date().toISOString() };
    },
    { connection }
);

whatsappWorker.on('completed', (job: Job) => {
    console.log(`\x1b[32m[Worker]\x1b[0m Job ${job.id} concluído. Mensagem lida e salva.`);
});

whatsappWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`\x1b[31m[Worker]\x1b[0m Job ${job?.id} falhou: ${err.message}`);
});
