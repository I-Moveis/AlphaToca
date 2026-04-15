"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receiveMessage = exports.verifyWebhook = void 0;
const whatsappQueue_1 = require("../queues/whatsappQueue");
const verifyWebhook = (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Webhook verified successfully.');
        res.status(200).send(challenge);
    }
    else {
        console.warn('[Webhook] Failed to verify webhook');
        res.sendStatus(403);
    }
};
exports.verifyWebhook = verifyWebhook;
const receiveMessage = async (req, res) => {
    // WhatsApp Meta requires an immediate 200 OK response to prevent timeouts and redeliveries.
    res.status(200).send('EVENT_RECEIVED');
    try {
        const payload = req.body;
        if (payload.object === 'whatsapp_business_account') {
            await whatsappQueue_1.messageQueue.add('whatsapp-message', payload, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: 100
            });
        }
    }
    catch (error) {
        console.error('[Webhook] Error persisting webhook message to queue:', error);
    }
};
exports.receiveMessage = receiveMessage;
