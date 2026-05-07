import { z } from 'zod';

// Body de POST /api/support/tickets. Apenas `title` e `description` vêm do
// cliente — `userId`, `userName`, `userRole` e `code` são todos derivados no
// servidor (JWT + gerador). Aceitar esses campos do cliente permitiria forjar
// tickets em nome de outro usuário ou com um `code` colidindo com um já
// existente, então ficam fora do schema de entrada.
export const createSupportTicketSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(4000),
});

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;
