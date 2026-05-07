import { z } from 'zod';

// Query params de GET /api/conversations/resolve. Ambos os ids devem ser UUIDs
// canônicos — valores fora do formato retornam 400 VALIDATION_ERROR antes de
// qualquer acesso ao banco. `landlordId` NÃO vem da query: é derivado do
// Property.landlordId pelo controller, para impedir que um tenant forje um
// landlord diferente do real dono do imóvel (e assim crie linhas órfãs na
// tabela conversations).
export const resolveConversationQuerySchema = z.object({
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
});

export type ResolveConversationQuery = z.infer<typeof resolveConversationQuerySchema>;

// Query params de GET /api/conversations (LL-011 — inbox list). `unreadOnly`
// é opcional; quando presente precisa ser literalmente 'true' ou 'false' (é um
// query-string, então sempre chega como string). Valores inválidos disparam
// 400 VALIDATION_ERROR antes do DB — evita que "unreadOnly=1" silenciosamente
// não filtre e gaste round-trips.
export const listConversationsQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;

// Path/query de GET /api/conversations/:id/messages (LL-012 — paginated
// history). `id` é o id da conversa (uuid). `before` é o cursor opcional: id
// da mensagem "mais nova já vista" pelo cliente — o servidor retorna o próximo
// lote ANTERIOR àquele id. `limit` vem como string via query; Zod coerce +
// clamp 1..100, default 50.
export const listConversationMessagesParamsSchema = z.object({
  id: z.string().uuid(),
});
export type ListConversationMessagesParams = z.infer<typeof listConversationMessagesParamsSchema>;

export const listConversationMessagesQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});
export type ListConversationMessagesQuery = z.infer<typeof listConversationMessagesQuerySchema>;
