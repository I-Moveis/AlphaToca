import { z } from 'zod';

export const WhatsAppContactSchema = z.object({
    wa_id: z.string().min(1),
    profile: z.object({
        name: z.string().optional(),
    }).optional(),
});

// Aceita qualquer tipo de mensagem que a Meta envie. O campo `text` continua
// sendo o único que o bot processa hoje; para os demais tipos (image, audio,
// sticker, location, unsupported…) o worker envia uma resposta padrão pedindo
// texto. O schema passa a ser tolerante porque a Meta adiciona tipos novos
// periodicamente — e um Zod rejeitando significa silêncio do bot.
export const WhatsAppMessageSchema = z
    .object({
        from: z.string().min(1),
        id: z.string().min(1),
        timestamp: z.string().min(1),
        type: z.string().min(1),
        text: z
            .object({
                body: z.string(),
            })
            .optional(),
    })
    .passthrough();

// Alias retrocompatível — arquivos que ainda importam o nome antigo continuam funcionando.
export const WhatsAppTextMessageSchema = WhatsAppMessageSchema;

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
    messages: z.array(WhatsAppMessageSchema).optional(),
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