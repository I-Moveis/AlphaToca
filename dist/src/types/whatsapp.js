"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppWebhookSchema = void 0;
const zod_1 = require("zod");
exports.WhatsAppWebhookSchema = zod_1.z.object({
    object: zod_1.z.string(),
    entry: zod_1.z.array(zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())),
});
