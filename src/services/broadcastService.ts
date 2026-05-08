import { z } from 'zod';
import { NotificationCategory, NotificationType } from '@prisma/client';
import prisma from '../config/db';
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

export type BroadcastResult = {
  sent: number;
  failed: number;
  persisted: number;
};

// ---------------------------------------------------------------------------
// Serviço de Broadcast
// ---------------------------------------------------------------------------
export const broadcastService = {
  /**
   * Envia uma notificação push para TODOS os usuários E persiste um
   * Notification row por target userId — US-013 cross-device.
   *
   * Ordem:
   *   1. SELECT all users (para persistência de histórico, inclusive quem não
   *      tem fcmToken registrado — o objetivo do rollout é exatamente que a
   *      tela /notifications seja cross-device, não FCM-dependent).
   *   2. INSERT em uma transação Prisma, um Notification por user com
   *      `type = BROADCAST`, `category = announcement`.
   *   3. FCM dispatch via pushNotificationService.broadcastToAll (HTTP,
   *      fora da transação — FCM não é transacional com o DB).
   *
   * Se a persistência falhar (DB down, etc.), o broadcast NÃO dispara — o
   * histórico é a fonte da verdade; push sem histórico quebra "cross-device".
   *
   * @returns { sent, failed, persisted } — sent/failed vêm da resposta do
   *   FCM; persisted é o número de Notification rows criados.
   */
  async sendToAll(input: BroadcastInput): Promise<BroadcastResult> {
    logger.info({ title: input.title }, '[broadcastService] Iniciando broadcast para todos os usuários.');

    const users = await prisma.user.findMany({
      select: { id: true, fcmToken: true },
    });

    let persisted = 0;
    if (users.length > 0) {
      const result = await prisma.$transaction(async (tx) => {
        return tx.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            type: NotificationType.BROADCAST,
            category: NotificationCategory.announcement,
            title: input.title,
            body: input.body,
          })),
        });
      });
      persisted = result.count;
    }

    const fcm = await pushNotificationService.broadcastToAll(
      input.title,
      input.body,
      { type: 'BROADCAST' },
    );

    logger.info({ ...fcm, persisted }, '[broadcastService] Broadcast concluído.');
    return { sent: fcm.sent, failed: fcm.failed, persisted };
  },
};
