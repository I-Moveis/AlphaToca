import { z } from 'zod';

export const WhatsAppWebhookSchema = z.object({
    object: z.string(),
    entry: z.array(z.record(z.string(), z.unknown())),
});

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppWebhookSchema>;
