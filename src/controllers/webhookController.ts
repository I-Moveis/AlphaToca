import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { messageQueue } from '../queues/whatsappQueue';
import { WhatsAppWebhookSchema } from '../schemas/whatsappSchema';
import { updateMessageStatus } from '../services/messageStatusService';
import { verifyMetaSignature } from '../utils/verifyMetaSignature';

/**
 * Valida no startup que as variáveis de ambiente necessárias ao webhook
 * estão presentes. Deve ser chamada antes de app.listen() para falhar
 * rápido em caso de configuração ausente.
 */
export function validateWebhookConfig(): void {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken || verifyToken.trim() === '') {
        throw new Error(
            '[Webhook] WHATSAPP_VERIFY_TOKEN não configurado. Configure no .env antes de subir o servidor.',
        );
    }
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret || appSecret.trim() === '') {
        throw new Error(
            '[Webhook] META_APP_SECRET não configurado. Obtenha em developers.facebook.com/apps/{id}/settings/basic.',
        );
    }
    console.log('[Webhook] Configuração validada com sucesso.');
}

export const verifyWebhook = (req: Request, res: Response) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Webhook verified successfully.');
        res.status(200).send(challenge);
    } else {
        console.warn('[Webhook] Failed to verify webhook');
        res.sendStatus(403);
    }
};

export const receiveMessage = async (req: Request, res: Response, _next: NextFunction) => {
    try {
        const appSecret = process.env.META_APP_SECRET;
        const isTestEnv = process.env.NODE_ENV === 'test';

        if (!isTestEnv) {
            if (!appSecret) {
                console.error('[Webhook] META_APP_SECRET ausente; rejeitando requisição.');
                res.status(500).send('EVENT_RECEIVED');
                return;
            }

            const signatureHeader = req.header('x-hub-signature-256');
            if (!verifyMetaSignature(req.rawBody, signatureHeader, appSecret)) {
                console.warn('[Webhook] Assinatura HMAC inválida; requisição rejeitada.');
                res.status(401).send('EVENT_RECEIVED');
                return;
            }
        }

        const value = req.body?.entry?.[0]?.changes?.[0]?.value;
        if (value?.statuses) {
            console.log(`\x1b[35m--- RECIBO DE STATUS DA META ---\x1b[0m\n${JSON.stringify(value.statuses, null, 2)}`);
            for (const s of value.statuses as Array<{ id: string; status: 'failed' | 'sent' | 'delivered' | 'read' }>) {
                updateMessageStatus({ id: s.id, status: s.status }).catch((err) => {
                    console.error('[Webhook] Erro ao processar status:', err);
                });
            }
            res.sendStatus(200);
            return;
        }

        const payload = WhatsAppWebhookSchema.parse(req.body);

        res.status(200).send('EVENT_RECEIVED');

        if (payload.object === 'whatsapp_business_account') {
            await messageQueue.add('whatsapp-message', payload, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 },
                removeOnComplete: true,
                removeOnFail: 100,
            });
        }
    } catch (error) {
        if (error instanceof ZodError) {
            console.error(`\x1b[31m[Webhook ZodError]\x1b[0m Payload inválido rejeitado: ${JSON.stringify(error.errors)}`);
            res.status(200).send('EVENT_RECEIVED');
            return;
        }
        console.error('[Webhook] Erro inesperado:', error);
        res.status(200).send('EVENT_RECEIVED');
    }
};