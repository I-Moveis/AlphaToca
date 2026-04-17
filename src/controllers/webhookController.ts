import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { messageQueue } from '../queues/whatsappQueue';
import { WhatsAppWebhookSchema } from '../schemas/whatsappSchema';
import { updateMessageStatus } from '../services/messageStatusService';

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
                attempts: 1,
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