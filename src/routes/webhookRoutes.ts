import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyWebhook, receiveMessage } from '../controllers/webhookController';

const router = Router();

const webhookRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'EVENT_RECEIVED',
    skip: () => process.env.NODE_ENV === 'test',
});

/**
 * @swagger
 * /webhook:
 *   get:
 *     summary: Verificar Webhook da Meta
 *     description: Endpoint utilizado pela Meta para verificar o servidor durante a configuração do webhook.
 *     tags: [Webhooks]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Verificação bem-sucedida, retorna a string challenge
 *       403:
 *         description: Falha na verificação
 */
router.get('/webhook', verifyWebhook);

/**
 * @swagger
 * /webhook:
 *   post:
 *     summary: Receber Mensagens do WhatsApp
 *     description: Endpoint para receber mensagens e eventos em tempo real da API do WhatsApp Business.
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/WhatsAppPayload'
 *     responses:
 *       200:
 *         description: Mensagem recebida com sucesso
 *       400:
 *         description: Payload inválido ou malformatado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/webhook', webhookRateLimiter, receiveMessage);

export default router;
