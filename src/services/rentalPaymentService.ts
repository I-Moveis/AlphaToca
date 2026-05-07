import prisma from '../config/db';
import { RentalPaymentStatus } from '@prisma/client';

// Formato YYYY-MM do servidor. Usado como chave da relação (propertyId, period)
// no modelo RentalPayment. O cliente NUNCA informa período — é sempre o mês
// corrente do servidor, para bloquear edição retroativa via API (US-010).
export function currentPeriod(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export type RentalPaymentView = {
  period: string;
  status: RentalPaymentStatus;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const rentalPaymentService = {
  /**
   * Retorna o status do aluguel do mês corrente para o imóvel. Quando não há
   * linha em rental_payments para (propertyId, period), responde com o default
   * AWAITING sem persistir — a PRD/US-009 exige forma idêntica ao caminho "linha
   * existe" para que o UI sempre renderize o dropdown. A gravação só acontece
   * via PUT (US-010, upsert).
   */
  async getCurrent(propertyId: string, now: Date = new Date()): Promise<RentalPaymentView> {
    const period = currentPeriod(now);
    const row = await prisma.rentalPayment.findUnique({
      where: {
        rental_payments_property_period_key: { propertyId, period },
      },
      select: {
        period: true,
        status: true,
        updatedAt: true,
        updatedBy: true,
      },
    });

    if (!row) {
      return {
        period,
        status: RentalPaymentStatus.AWAITING,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      period: row.period,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  },
};
