import { NextFunction, Request, Response } from 'express';
import { messageQueue } from '../queues/whatsappQueue';
import { WhatsAppWebhookPayload, WhatsAppWebhookSchema } from '../types/whatsapp';

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

export const receiveMessage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const value = req.body?.entry?.[0]?.changes?.[0]?.value;
        if (value?.statuses) {
            console.error(`\x1b[35m--- RECIBO DE STATUS DA META ---\x1b[0m\n${JSON.stringify(value.statuses, null, 2)}`);
            return res.sendStatus(200);
        }

        const payload = WhatsAppWebhookSchema.parse(req.body);

        // 2. Se o dado é seguro e válido, a WhatsApp Meta requires an immediate 200 OK.
        res.status(200).send('EVENT_RECEIVED');

        if (payload.object === 'whatsapp_business_account') {
            await messageQueue.add('whatsapp-message', payload, {
                attempts: 1,
                removeOnComplete: true,
                removeOnFail: 100
            });
        }
    } catch (error) {
        // Envia o erro (ZodError, etc) pro nosso Global errorHandler formatar o 400 Bad Request.
        next(error); 
    }
};
