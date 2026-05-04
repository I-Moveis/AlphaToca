import { z } from 'zod';
import { pushNotificationService } from './pushNotificationService';
import { logger } from '../config/logger';

// ---------------------------------------------------------------------------
// Validação do payload de broadcast
// ---------------------------------------------------------------------------
export const broadcastSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(100),
  body: z.string().min(1, 'Mensagem é obrigatória').max(500),
});

export type BroadcastInput = z.infer<typeof broadcastSchema>;

// ---------------------------------------------------------------------------
// Serviço de Broadcast
// ---------------------------------------------------------------------------
export const broadcastService = {
  /**
   * Envia uma notificação push para TODOS os usuários com fcmToken registrado.
   * Usado pela rota POST /admin/broadcast (apenas ADMIN).
   *
   * Não persiste no banco — é uma mensagem genérica sem userId específico.
   *
   * @returns Objeto com contagem de envios bem-sucedidos e falhas.
   */
  async sendToAll(input: BroadcastInput): Promise<{ sent: number; failed: number }> {
    logger.info({ title: input.title }, '[broadcastService] Iniciando broadcast para todos os usuários.');

    const result = await pushNotificationService.broadcastToAll(
      input.title,
      input.body,
      { type: 'BROADCAST' },
    );

    logger.info(result, '[broadcastService] Broadcast concluído.');
    return result;
  },
};
