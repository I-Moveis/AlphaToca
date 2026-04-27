import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import type { ChatSession, PrismaClient } from '@prisma/client';
import { WhatsAppWebhookPayload } from '../types/whatsapp';
import prisma from '../config/db';
import { sendMessage as defaultSendMessage, SendMessageResponse } from '../services/whatsappService';
import { generateAnswer as defaultGenerateAnswer, GenerateAnswerResult } from '../services/ragChainService';
import { extractInsights as defaultExtractInsights, ExtractInsightsResult } from '../services/leadExtractionService';
import { logger, type Logger } from '../config/logger';
import { checkPhoneRateLimit, type PhoneRateLimitResult } from '../utils/phoneRateLimiter';

export const RAG_ERROR_FALLBACK =
    'Desculpe, tive um problema técnico para responder agora. Um de nossos atendentes humanos vai continuar esse atendimento em instantes.';

export const RATE_LIMIT_REPLY =
    'Você enviou várias mensagens muito rápido. Aguarde alguns instantes e tente novamente, por favor.';

export const LEAD_EXTRACTION_CONCURRENCY = Number(process.env.LEAD_EXTRACTION_CONCURRENCY ?? 3);

export const PHONE_RATE_LIMIT = Number(process.env.PHONE_RATE_LIMIT ?? 10);
export const PHONE_RATE_WINDOW_SECONDS = Number(process.env.PHONE_RATE_WINDOW_SECONDS ?? 60);

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function isSessionExpired(
    session: { expiresAt?: Date | null } | null | undefined,
    now: Date = new Date(),
): boolean {
    if (!session || !session.expiresAt) return false;
    return session.expiresAt.getTime() <= now.getTime();
}

export interface ConcurrencyLimiter {
    run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(max: number): ConcurrencyLimiter {
    let active = 0;
    const waiters: Array<() => void> = [];
    return {
        async run<T>(fn: () => Promise<T>): Promise<T> {
            if (active >= max) {
                await new Promise<void>((resolve) => waiters.push(resolve));
            } else {
                active++;
            }
            try {
                return await fn();
            } finally {
                const next = waiters.shift();
                if (next) {
                    next();
                } else {
                    active--;
                }
            }
        },
    };
}

const defaultLeadExtractionLimiter = createConcurrencyLimiter(LEAD_EXTRACTION_CONCURRENCY);

type PrismaWorkerClient = Pick<PrismaClient, 'user' | 'chatSession' | 'message'>;

type SendMessageFn = (to: string, text: string) => Promise<SendMessageResponse>;

type GenerateAnswerFn = (input: {
    sessionId: string;
    userMessage: string;
}) => Promise<GenerateAnswerResult>;

type ExtractInsightsFn = (input: {
    sessionId: string;
    userMessage: string;
}) => Promise<ExtractInsightsResult>;

export type PhoneRateLimitCheck = (phoneNumber: string) => Promise<PhoneRateLimitResult>;

export interface WhatsappHandlerDeps {
    prisma: PrismaWorkerClient;
    sendMessage: SendMessageFn;
    generateAnswer: GenerateAnswerFn;
    extractInsights: ExtractInsightsFn;
    scheduleMicrotask?: (task: () => void) => void;
    leadExtractionLimiter?: ConcurrencyLimiter;
    log?: Logger;
    checkRateLimit?: PhoneRateLimitCheck;
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
    const log = deps.log ?? logger;
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
            log.info({ wamid }, '[worker] duplicate wamid; skipping');
            return { success: true, reason: 'duplicate_wamid' };
        }
    }

    const phoneNumber = contact.wa_id;
    const contactName = contact.profile?.name || 'Lead';
    const messageText = message.text?.body || '[Mídia Recebida]';

    if (deps.checkRateLimit) {
        const rl = await deps.checkRateLimit(phoneNumber);
        if (!rl.allowed) {
            log.warn(
                { phoneNumber, count: rl.count, limit: rl.limit, retryAfterSeconds: rl.retryAfterSeconds },
                '[worker] phone rate limit exceeded',
            );
            try {
                await deps.sendMessage(phoneNumber, RATE_LIMIT_REPLY);
            } catch (err) {
                log.error({ err }, '[worker] failed to send rate-limit reply');
            }
            return { success: true, reason: 'rate_limited' };
        }
    }

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

    const expired = isSessionExpired(chatSession);
    if (!chatSession || chatSession.status !== 'ACTIVE_BOT' || expired) {
        if (chatSession) {
            log.info(
                {
                    sessionId: chatSession.id,
                    reason: expired ? 'expired' : 'inactive',
                    previousStatus: chatSession.status,
                    expiresAt: chatSession.expiresAt?.toISOString?.() ?? null,
                },
                '[worker] replacing inactive session with new ACTIVE_BOT',
            );
        }
        chatSession = await deps.prisma.chatSession.create({
            data: {
                tenantId: user.id,
                status: 'ACTIVE_BOT',
                expiresAt: new Date(Date.now() + SESSION_TTL_MS),
            },
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
        log.error({ err }, '[worker] RAG chain failure');
        answer = RAG_ERROR_FALLBACK;
        handoff = true;
        ragError = true;
    }

    let outboundWamid: string | null = null;
    try {
        const response = await deps.sendMessage(phoneNumber, answer);
        outboundWamid = response.messages?.[0]?.id ?? null;
    } catch (sendError) {
        log.error({ err: sendError }, '[worker] failed to send WhatsApp message');
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

    if (!ragError) {
        const schedule = deps.scheduleMicrotask ?? queueMicrotask;
        const limiter = deps.leadExtractionLimiter ?? defaultLeadExtractionLimiter;
        const sessionIdForExtraction = chatSession.id;
        schedule(() => {
            limiter
                .run(() =>
                    deps.extractInsights({
                        sessionId: sessionIdForExtraction,
                        userMessage: messageText,
                    }),
                )
                .catch((err) => {
                    log.error(
                        { err, sessionId: sessionIdForExtraction },
                        '[worker] lead extraction failed',
                    );
                });
        });
    }

    log.info({ phoneNumber, sessionId: chatSession.id, handoff, ragError }, '[worker] message processed');
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
    logger.error({ err }, '[worker] redis connection failed');
    process.exit(1);
});

export const whatsappWorker = new Worker<WhatsAppWebhookPayload>(
    'whatsapp-messages',
    async (job: Job<WhatsAppWebhookPayload>) => {
        const wamid = (job.data as any)?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
        const jobLog = logger.child({ jobId: job.id, wamid });
        jobLog.info('[worker] processing job');
        try {
            return await handleWhatsappMessage(job.data, {
                prisma,
                sendMessage: defaultSendMessage,
                generateAnswer: defaultGenerateAnswer,
                extractInsights: defaultExtractInsights,
                log: jobLog,
                checkRateLimit: (phoneNumber) =>
                    checkPhoneRateLimit(connection, phoneNumber, {
                        limit: PHONE_RATE_LIMIT,
                        windowSeconds: PHONE_RATE_WINDOW_SECONDS,
                    }),
            });
        } catch (dbError: any) {
            if (dbError?.code === 'P2002' && dbError?.meta?.target?.includes('wamid')) {
                jobLog.info('[worker] duplicate wamid unique constraint; skipping');
                return { success: true, reason: 'duplicate_wamid_db' };
            }
            jobLog.error({ err: dbError }, '[worker] job failed');
            throw dbError;
        }
    },
    { connection, lockDuration: 60000 }
);

whatsappWorker.on('completed', (job: Job) => {
    logger.info({ jobId: job.id }, '[worker] job completed');
});

whatsappWorker.on('failed', (job: Job | undefined, err: Error) => {
    const attemptsMade = job?.attemptsMade ?? 0;
    const maxAttempts = job?.opts?.attempts ?? 1;
    const exhausted = attemptsMade >= maxAttempts;
    const level = exhausted ? 'dead-letter' : 'retry';
    logger.error(
        { jobId: job?.id, attemptsMade, maxAttempts, level, err },
        `[worker] job failed (${level})`,
    );
});
