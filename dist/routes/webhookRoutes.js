"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const webhookController_1 = require("../controllers/webhookController");
const router = (0, express_1.Router)();
// Endpoint for Meta to verify the webhook connection
router.get('/webhook', webhookController_1.verifyWebhook);
// Endpoint to receive events/messages from WhatsApp
router.post('/webhook', webhookController_1.receiveMessage);
exports.default = router;
