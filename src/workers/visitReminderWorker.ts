import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import prisma from '../config/db';
import { pushNotificationService } from '../services/pushNotificationService';
import { logger } from '../config/logger';

/**
 * Worker de Lembretes de Visita
 *
 * Roda via cron job a cada hora (configurado abaixo).
 * A cada execução, busca visitas com status SCHEDULED que ocorrem:
 *   - Em aproximadamente 24 horas (janela: 23h30 a 24h30)
 *   - Em aproximadamente 2 horas  (janela: 1h30 a 2h30)
 *
 * Para cada visita encontrada, dispara VISIT_REMINDER para o inquilino e o locador.
 *
 * Idempotência: A janela de ±30 minutos garante que o job horário nunca perca
 * uma visita, mas pode processar a mesma visita duas vezes se o cron atrasar.
 * Isso é aceitável — duplicar um lembrete é menos grave que não enviá-lo.
 */

if (!process.env.REDIS_URL) {
  throw new Error('[ReminderWorker] REDIS_URL não definida no ambiente.');
}

const connection = new IORedis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: () => null,
});

connection.on('error', (err) => {
  logger.error({ err }, '[ReminderWorker] redis connection failed');
  process.exit(1);
});

// Janela de ±30 min em torno do horário alvo para garantir cobertura entre execuções horárias
const WINDOW_MS = 30 * 60 * 1000;

async function sendRemindersForWindow(targetHours: 24 | 2): Promise<void> {
  const now = new Date();
  const targetMs = targetHours * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() + targetMs - WINDOW_MS);
  const windowEnd = new Date(now.getTime() + targetMs + WINDOW_MS);

  const visits = await prisma.visit.findMany({
    where: {
      status: 'SCHEDULED',
      scheduledAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      tenant: { select: { id: true, fcmToken: true } },
      landlord: { select: { id: true, fcmToken: true } },
      property: { select: { title: true } },
    },
  });

  if (visits.length === 0) {
    logger.info(`[ReminderWorker] Nenhuma visita encontrada para a janela de ${targetHours}h.`);
    return;
  }

  logger.info(`[ReminderWorker] ${visits.length} visita(s) encontrada(s) para lembrete de ${targetHours}h.`);

  const timeLabel = targetHours === 24 ? 'amanhã' : 'em 2 horas';
  const scheduledAtFormatted = (date: Date) =>
    date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const promises = visits.flatMap((visit) => {
    const propertyTitle = visit.property?.title ?? 'imóvel';
    const dateLabel = scheduledAtFormatted(visit.scheduledAt);
    const data = {
      visitId: visit.id,
      propertyId: visit.propertyId,
      type: 'VISIT_REMINDER',
    };

    return [
      // Lembrete para o inquilino
      pushNotificationService.notify({
        userId: visit.tenant.id,
        fcmToken: visit.tenant.fcmToken,
        type: 'VISIT_REMINDER',
        title: `Lembrete: Visita ${timeLabel}!`,
        body: `Você tem uma visita ao imóvel "${propertyTitle}" agendada para ${dateLabel}.`,
        data,
      }).catch((err) =>
        logger.error({ err, visitId: visit.id }, '[ReminderWorker] Falha ao notificar inquilino')
      ),

      // Lembrete para o locador
      pushNotificationService.notify({
        userId: visit.landlord.id,
        fcmToken: visit.landlord.fcmToken,
        type: 'VISIT_REMINDER',
        title: `Lembrete: Visita ao seu imóvel ${timeLabel}!`,
        body: `Uma visita ao imóvel "${propertyTitle}" está agendada para ${dateLabel}.`,
        data,
      }).catch((err) =>
        logger.error({ err, visitId: visit.id }, '[ReminderWorker] Falha ao notificar locador')
      ),
    ];
  });

  await Promise.allSettled(promises);
}

// ---------------------------------------------------------------------------
// Worker BullMQ — processador de jobs
// ---------------------------------------------------------------------------
export const visitReminderWorker = new Worker<{ windowHours: 24 | 2 }>(
  'visit-reminders',
  async (job: Job<{ windowHours: 24 | 2 }>) => {
    const { windowHours } = job.data;
    logger.info({ jobId: job.id, windowHours }, '[ReminderWorker] processando job de lembrete');
    await sendRemindersForWindow(windowHours);
  },
  { connection }
);

visitReminderWorker.on('completed', (job: Job) => {
  logger.info({ jobId: job.id }, '[ReminderWorker] job concluído com sucesso');
});

visitReminderWorker.on('failed', (job: Job | undefined, err: Error) => {
  logger.error({ jobId: job?.id, err }, '[ReminderWorker] job falhou');
});

// ---------------------------------------------------------------------------
// Cron: dispara 2 jobs a cada hora (janela de 24h e janela de 2h)
// ---------------------------------------------------------------------------
async function scheduleReminderJobs(): Promise<void> {
  const { notificationQueue } = await import('../queues/notificationQueue');

  // Disparo imediato ao iniciar + repetição a cada hora via setInterval
  const run = async () => {
    await notificationQueue.add('reminder-24h', { windowHours: 24 });
    await notificationQueue.add('reminder-2h', { windowHours: 2 });
    logger.info('[ReminderWorker] Jobs de lembrete agendados para esta hora.');
  };

  await run();
  setInterval(run, 60 * 60 * 1000); // a cada 1 hora
}

scheduleReminderJobs().catch((err) => {
  logger.error({ err }, '[ReminderWorker] Falha ao inicializar cron de lembretes');
});
