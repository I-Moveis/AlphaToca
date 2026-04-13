import { Router } from 'express';
import { verifyWebhook, receiveMessage } from '../controllers/webhookController';

const router = Router();

// Endpoint for Meta to verify the webhook connection
router.get('/webhook', verifyWebhook);

// Endpoint to receive events/messages from WhatsApp
router.post('/webhook', receiveMessage);

export default router;
