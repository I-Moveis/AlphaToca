import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import type { ChatSession, PrismaClient } from '@prisma/client';
import { WhatsAppWebhookPayload } from '../types/whatsapp';
import prisma from '../config/db';
import { sendMessage as defaultSendMessage, SendMessageResponse } from '../services/whatsappService';
import { generateAnswer as defaultGenerateAnswer, GenerateAnswerResult } from '../services/ragChainService';

export const RAG_ERROR_FALLBACK =
    'Desculpe, tive um problema técnico para responder agora. Um de nossos atendentes humanos vai continuar esse atendimento em instantes.';

type PrismaWorkerClient = Pick<PrismaClient, 'user' | 'chatSession' | 'message'>;

type SendMessageFn = (to: string, text: string) => Promise<SendMessageResponse>;

type GenerateAnswerFn = (input: {
    sessionId: string;
    userMessage: string;
}) => Promise<GenerateAnswerResult>;

export interface WhatsappHandlerDeps {
    prisma: PrismaWorkerClient;
    sendMessage: SendMessageFn;
    generateAnswer: GenerateAnswerFn;
}

export interface WhatsappHandlerResult {
    success: boolean;
    reason?: string;
    handoff?: boolean;
    ragError?: boolean;
}

export async function handleWhatsappMessage(
    payload: WhatsAppWebhookPayload,
    deps: WhatsappHandlerDeps,
): Promise<WhatsappHandlerResult> {
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
        const existing = await deps.prisma.message.findUnique({ where: { wamid } });
        if (existing) {
            console.log(`\x1b[33m[Worker]\x1b[0m Mensagem ${wamid} já processada. Ignorando.`);
            return { success: true, reason: 'duplicate_wamid' };
        }
    }

    const phoneNumber = contact.wa_id;
    const contactName = contact.profile?.name || 'Lead';
    const messageText = message.text?.body || '[Mídia Recebida]';

    const user = await deps.prisma.user.upsert({
        where: { phoneNumber },
        update: { name: contactName },
        create: {
            phoneNumber,
            name: contactName,
            role: 'TENANT',
        },
    });

    let chatSession: ChatSession | null = await deps.prisma.chatSession.findFirst({
        where: { tenantId: user.id },
        orderBy: { startedAt: 'desc' },
    });

    if (!chatSession) {
        chatSession = await deps.prisma.chatSession.create({
            data: { tenantId: user.id, status: 'ACTIVE_BOT' },
        });
    }

    await deps.prisma.message.create({
        data: {
            wamid: wamid || null,
            sessionId: chatSession.id,
            senderType: 'TENANT',
            content: messageText,
        },
    });

    if (chatSession.status !== 'ACTIVE_BOT') {
        console.log(
            `\x1b[33m[Worker]\x1b[0m Sessão ${chatSession.id} com status ${chatSession.status}; inbound persistido sem resposta automática.`,
        );
        return { success: true, reason: `session_${chatSession.status.toLowerCase()}` };
    }

    let answer: string;
    let handoff: boolean;
    let ragError = false;

    try {
        const result = await deps.generateAnswer({
            sessionId: chatSession.id,
            userMessage: messageText,
        });
        answer = result.answer;
        handoff = result.handoff;
    } catch (err) {
        console.error(`\x1b[31m[Worker]\x1b[0m Falha no RAG chain:`, err);
        answer = RAG_ERROR_FALLBACK;
        handoff = true;
        ragError = true;
    }

    let outboundWamid: string | null = null;
    try {
        const response = await deps.sendMessage(phoneNumber, answer);
        outboundWamid = response.messages?.[0]?.id ?? null;
    } catch (sendError) {
        console.error(
            `\x1b[31m[Worker]\x1b[0m Falha ao enviar mensagem WhatsApp: ${(sendError as Error).message}`,
        );
    }

    await deps.prisma.message.create({
        data: {
            wamid: outboundWamid,
            sessionId: chatSession.id,
            senderType: 'BOT',
            content: answer,
        },
    });

    if (handoff) {
        await deps.prisma.chatSession.update({
            where: { id: chatSession.id },
            data: { status: 'WAITING_HUMAN' },
        });
    }

    console.log(`\x1b[32m[Worker]\x1b[0m Mensagem de ${phoneNumber} processada com sucesso!`);
    return { success: true, handoff, ragError };
}

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
        console.log(`\x1b[32m[Worker]\x1b[0m Processando Job ID ${job.id}`);
        try {
            return await handleWhatsappMessage(job.data, {
                prisma,
                sendMessage: defaultSendMessage,
                generateAnswer: defaultGenerateAnswer,
            });
        } catch (dbError: any) {
            if (dbError?.code === 'P2002' && dbError?.meta?.target?.includes('wamid')) {
                console.log(
                    `\x1b[33m[Worker]\x1b[0m Mensagem já existe no banco (unique constraint). Ignorando.`,
                );
                return { success: true, reason: 'duplicate_wamid_db' };
            }
            console.error(`\x1b[31m[Worker]\x1b[0m Falha no Job ${job.id}:`, dbError);
            throw dbError;
        }
    },
    { connection }
);

whatsappWorker.on('completed', (job: Job) => {
    console.log(`\x1b[36m[Worker Info]\x1b[0m Trello de Eventos rodou no Job ${job.id}`);
});

whatsappWorker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`\x1b[31m[Worker ERRO]\x1b[0m O Job ${job?.id} falhou. Err: ${err.message}`);
});
