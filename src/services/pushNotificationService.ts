import admin from '../config/firebase';
import { logger } from '../config/logger';

interface PushNotificationPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export const pushNotificationService = {
  /**
   * Envia uma notificação push via Firebase Cloud Messaging (FCM).
   * 
   * @param payload Objeto contendo o token de destino, título, corpo da mensagem e dados extras.
   * @returns boolean indicando sucesso ou falha no envio.
   */
  async sendPushNotification(payload: PushNotificationPayload): Promise<boolean> {
    const { token, title, body, data } = payload;

    if (!admin.apps.length) {
      logger.warn('[Firebase] Tentativa de enviar push notification, mas o Admin SDK não está inicializado.');
      return false;
    }

    try {
      const message = {
        notification: {
          title,
          body,
        },
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
   * Envia a mesma notificação push para múltiplos tokens.
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
        notification: {
          title,
          body,
        },
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
  }
};
