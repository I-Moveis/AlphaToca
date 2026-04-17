import { z } from 'zod';

export const WhatsAppContactSchema = z.object({
    wa_id: z.string().min(1),
    profile: z.object({
        name: z.string().optional(),
    }).optional(),
});

export const WhatsAppTextMessageSchema = z.object({
    from: z.string().min(1),
    id: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.literal('text'),
    text: z.object({
        body: z.string(),
    }),
});

export const WhatsAppStatusSchema = z.object({
    id: z.string().min(1),
    status: z.enum(['failed', 'sent', 'delivered', 'read']),
    timestamp: z.string().optional(),
    recipient_id: z.string().optional(),
});

export const WhatsAppChangeValueSchema = z.object({
    messaging_product: z.string().optional(),
    metadata: z.object({
        display_phone_number: z.string().optional(),
        phone_number_id: z.string().optional(),
    }).optional(),
    contacts: z.array(WhatsAppContactSchema).optional(),
    messages: z.array(WhatsAppTextMessageSchema).optional(),
    statuses: z.array(WhatsAppStatusSchema).optional(),
});

export const WhatsAppChangeSchema = z.object({
    value: WhatsAppChangeValueSchema,
    field: z.string().optional(),
});

export const WhatsAppEntrySchema = z.object({
    id: z.string(),
    changes: z.array(WhatsAppChangeSchema),
});

export const WhatsAppWebhookSchema = z.object({
    object: z.string(),
    entry: z.array(WhatsAppEntrySchema).min(1),
});

export type WhatsAppWebhookPayload = z.infer<typeof WhatsAppWebhookSchema>;