import { Queue } from 'bullmq';
import { queueRedisConnection } from './whatsappQueue';

/**
 * Fila BullMQ para o processamento de lembretes de visita.
 * Reutiliza a mesma conexão Redis do whatsappQueue.
 *
 * Jobs disparados pelo visitReminderWorker (cron a cada hora).
 * Cada job representa um batch de lembretes a enviar (24h ou 2h antes).
 */
export const notificationQueue = new Queue<{ windowHours: 24 | 2 }>('visit-reminders', {
  connection: queueRedisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 50 },
  },
});
