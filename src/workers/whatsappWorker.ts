import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { WhatsAppWebhookPayload } from '../types/whatsapp';
import prisma from '../config/db';
import { sendMessage } from '../services/whatsappService';

if (!process.env.REDIS_URL) {
    throw new Error('[Worker] REDIS_URL não definida no ambiente. O Worker não pode iniciar sem uma conexão Redis configurada.');
}
const connection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: () => null,
});

connection.on('error', (err) => {
    console.error(`\x1b[31m[Worker ERRO]\x1b[0m Redis connection failed: ${err.message}`);
    process.exit(1);
});

export const whatsappWorker = new Worker<WhatsAppWebhookPayload>(
    'whatsapp-messages',
    async (job: Job<WhatsAppWebhookPayload>) => {
        const payload = job.data;
        
        console.log(`\x1b[32m[Worker]\x1b[0m Processando Job ID ${job.id}`);
        
        const changeValue = (payload as any).entry?.[0]?.changes?.[0]?.value;
        if (!changeValue) {
            return { success: true, reason: 'ignored_empty_changes' };
        }

        const contact = changeValue.contacts?.[0];
        const message = changeValue.messages?.[0];

        if (!message || !contact) {
            return { success: true, reason: 'ignored_not_message' };
        }

        const wamid: string = message.id;
        if (wamid) {
            const existing = await prisma.message.findUnique({ where: { wamid } });
            if (existing) {
                console.log(`\x1b[33m[Worker]\x1b[0m Mensagem ${wamid} já processada. Ignorando.`);
                return { success: true, reason: 'duplicate_wamid' };
            }
        }

        const phoneNumber = contact.wa_id;
        const contactName = contact.profile?.name || 'Lead';
        const messageText = message.text?.body || '[Mídia Recebida]';

        try {
            const user = await prisma.user.upsert({
                where: { phoneNumber },
                update: { name: contactName },
                create: {
                    phoneNumber,
                    name: contactName,
                    role: 'TENANT'
                }
            });

            let chatSession = await prisma.chatSession.findFirst({
                where: {
                    tenantId: user.id,
                    status: 'ACTIVE_BOT'
                },
                orderBy: {
                    startedAt: 'desc'
                }
            });

            if (!chatSession) {
                chatSession = await prisma.chatSession.create({
                    data: {
                        tenantId: user.id,
                        status: 'ACTIVE_BOT'
                    }
                });
            }

            await prisma.message.create({
                data: {
                    wamid: wamid || null,
                    sessionId: chatSession.id,
                    senderType: 'TENANT',
                    content: messageText
                }
            });

        } catch (dbError: any) {
            if (dbError?.code === 'P2002' && dbError?.meta?.target?.includes('wamid')) {
                console.log(`\x1b[33m[Worker]\x1b[0m Mensagem ${wamid} já existe no banco (unique constraint). Ignorando.`);
                return { success: true, reason: 'duplicate_wamid_db' };
            }
            console.error(`\x1b[31m[Worker]\x1b[0m Falha de DB no Job ${job.id}:`, dbError);
            throw dbError;
        }

        try {
            await sendMessage(phoneNumber, `Olá! Sou o assistente do AlphaToca. Recebi sua mensagem: ${messageText}`);
        } catch (sendError) {
            console.error(`\x1b[31m[Worker]\x1b[0m Falha ao enviar mensagem WhatsApp: ${(sendError as Error).message}`);
        }

        console.log(`\x1b[32m[Worker]\x1b[0m Mensagem de ${phoneNumber} processada com sucesso!`);
        return { success: true, saved: true };
    },
    { connection }
);

whatsappWorker.on('completed', (job: Job) => {
    console.log(`\x1b[36m[Worker Info]\x1b[0m Trello de Eventos rodou no Job ${job.id}`);
});

whatsappWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`\x1b[31m[Worker ERRO]\x1b[0m O Job ${job?.id} falhou. Err: ${err.message}`);
});
