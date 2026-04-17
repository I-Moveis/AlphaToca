import prisma from '../config/db';
import { MessageStatus } from '@prisma/client';

export const STATUS_WEIGHT: Record<MessageStatus, number> = {
  failed: 0,
  sent: 1,
  delivered: 2,
  read: 3,
};

type MetaWebhookStatus = 'failed' | 'sent' | 'delivered' | 'read';

interface MetaStatusPayload {
  id: string;
  status: MetaWebhookStatus;
}

export async function updateMessageStatus(payload: MetaStatusPayload): Promise<void> {
  const { id: wamid, status: newStatus } = payload;

  const message = await prisma.message.findUnique({ where: { wamid } });

  if (!message) {
    console.log(`[StatusService] Mensagem com wamid ${wamid} não encontrada no banco.`);
    return;
  }

  const currentWeight = STATUS_WEIGHT[message.status];
  const newWeight = STATUS_WEIGHT[newStatus];

  if (newWeight <= currentWeight) {
    console.log(
      `[StatusService] Ignorado: status recebido "${newStatus}" (peso ${newWeight}) ` +
      `<= status atual "${message.status}" (peso ${currentWeight}) para wamid ${wamid}.`
    );
    return;
  }

  await prisma.message.update({
    where: { wamid },
    data: { status: newStatus },
  });

  console.log(
    `[StatusService] Atualizado: wamid ${wamid} de "${message.status}" → "${newStatus}".`
  );
}
