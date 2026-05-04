import { NotificationType } from '@prisma/client';
import admin from '../config/firebase';
import prisma from '../config/db';
import { logger } from '../config/logger';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PushNotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface NotifyPayload {
  /** ID do usuário no banco (para persistência). Obrigatório para salvar no histórico. */
  userId: string;
  /** FCM token do dispositivo do usuário. Se ausente, apenas persiste no banco. */
  fcmToken?: string | null;
  /** Tipo da notificação (enum NotificationType). */
  type: NotificationType;
  /** Título exibido na notificação. */
  title: string;
  /** Corpo/mensagem da notificação. */
  body: string;
  /** Dados extras para deep link no app (visitId, propertyId, etc.). */
  data?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Serviço
// ---------------------------------------------------------------------------

export const pushNotificationService = {
  /**
   * Método principal — persiste a notificação no banco E dispara o push FCM.
   *
   * Use este método em todos os gatilhos de negócio (visitas, locação, etc.).
   * A persistência no banco garante o histórico mesmo se o FCM falhar.
   */
  async notify(payload: NotifyPayload): Promise<void> {
    const { userId, fcmToken, type, title, body, data } = payload;

    // 1. Persiste no banco (histórico do app) — sempre, independente do FCM
    try {
      await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          body,
          data: data ?? undefined,
        },
      });
    } catch (err) {
      logger.error({ err, userId, type }, '[Notification] Falha ao persistir notificação no banco.');
    }

    // 2. Dispara push FCM — somente se o usuário tiver um token registrado
    if (fcmToken) {
      await pushNotificationService.sendPushNotification({ token: fcmToken, title, body, data });
    } else {
      logger.info(`[Notification] Usuário ${userId} sem fcmToken. Notificação persistida no banco, mas push não enviado.`);
    }
  },

  /**
   * Envia uma notificação push via Firebase Cloud Messaging (FCM) para um único token.
   * Não persiste no banco — use notify() para o fluxo completo.
   */
  async sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
    const { token, title, body, data } = payload;

    if (!admin.apps.length) {
      logger.warn('[Firebase] Tentativa de enviar push notification, mas o Admin SDK não está inicializado.');
      return false;
    }

    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token,
      };

      const response = await admin.messaging().send(message);
      logger.info(`[Firebase] Notificação push enviada com sucesso. Message ID: ${response}`);
      return true;
    } catch (error) {
      logger.error({ err: error, token }, '[Firebase] Falha ao enviar notificação push');
      return false;
    }
  },

  /**
   * Broadcast — envia a mesma notificação push para TODOS os usuários com fcmToken registrado.
   * Usado pela rota POST /admin/broadcast (sistema de notícias).
   * Não persiste no banco (mensagem genérica sem userId específico).
   */
  async broadcastToAll(title: string, body: string, data?: Record<string, string>): Promise<{ sent: number; failed: number }> {
    if (!admin.apps.length) {
      logger.warn('[Firebase] Tentativa de broadcast, mas o Admin SDK não está inicializado.');
      return { sent: 0, failed: 0 };
    }

    // Busca todos os tokens ativos no banco
    const users = await prisma.user.findMany({
      where: { fcmToken: { not: null } },
      select: { fcmToken: true },
    });

    const tokens = users.map((u) => u.fcmToken as string);

    if (tokens.length === 0) {
      logger.info('[Firebase] Broadcast: nenhum usuário com fcmToken registrado.');
      return { sent: 0, failed: 0 };
    }

    try {
      const message = {
        notification: { title, body },
        data: data || {},
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      logger.info(`[Firebase] Broadcast enviado. Sucessos: ${response.successCount}, Falhas: ${response.failureCount}`);
      return { sent: response.successCount, failed: response.failureCount };
    } catch (error) {
      logger.error({ err: error }, '[Firebase] Falha ao enviar broadcast');
      return { sent: 0, failed: tokens.length };
    }
  },

  /**
   * Envia a mesma notificação push para múltiplos tokens específicos.
   * @deprecated Prefira notify() ou broadcastToAll() para novos usos.
   */
  async sendMulticastPushNotification(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<boolean> {
    if (!admin.apps.length) {
      logger.warn('[Firebase] Tentativa de enviar multicast push, mas o Admin SDK não está inicializado.');
      return false;
    }

    if (!tokens || tokens.length === 0) {
      return false;
    }

    try {
      const message = {
        notification: { title, body },
        data: data || {},
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      logger.info(`[Firebase] Multicast push enviado. Sucessos: ${response.successCount}, Falhas: ${response.failureCount}`);
      return response.successCount > 0;
    } catch (error) {
      logger.error({ err: error }, '[Firebase] Falha ao enviar multicast push notification');
      return false;
    }
  },
};
