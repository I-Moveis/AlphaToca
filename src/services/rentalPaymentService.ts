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
  amount: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

// LL-009: item do histórico de pagamentos listado por
// GET /api/properties/:propertyId/payments?tenantId=. `amount` é number (não
// nullable) — linhas anteriores ao backfill da coluna (LL-003) ficam com 0.
// `paidAt` é preenchido a partir de `updatedAt` APENAS quando `status=PAID`;
// nos demais status volta `null`.
export type RentalPaymentHistoryItem = {
  period: string;
  amount: number;
  status: RentalPaymentStatus;
  paidAt: string | null;
};

// Enumera YYYY-MM (UTC) cobrindo todos os meses de [start, end], inclusive em
// ambos. Mesma semântica usada em `analyticsService.monthlySeries`, mas local
// aqui para evitar acoplamento entre os dois módulos.
function enumerateMonthsUtcInclusive(start: Date, end: Date): string[] {
  const startY = start.getUTCFullYear();
  const startM = start.getUTCMonth();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  const months: string[] = [];
  let y = startY;
  let m = startM;
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

// Retorna o monthly_rent do contrato ACTIVE para o imóvel, ou `null` quando
// não há contrato ativo no momento. Leitura no write time — histórico de
// mudanças de rent NÃO é preservado (ver PRD §8 Q2 e o header da migration
// 20260507210000_add_rental_payment_amount).
async function getActiveMonthlyRent(propertyId: string): Promise<number | null> {
  const contract = await prisma.contract.findFirst({
    where: { propertyId, status: 'ACTIVE' },
    select: { monthlyRent: true },
    orderBy: { createdAt: 'desc' },
  });
  return contract ? Number(contract.monthlyRent) : null;
}

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
        amount: true,
        updatedAt: true,
        updatedBy: true,
      },
    });

    if (!row) {
      return {
        period,
        status: RentalPaymentStatus.AWAITING,
        amount: null,
        updatedAt: null,
        updatedBy: null,
      };
    }

    return {
      period: row.period,
      status: row.status,
      amount: row.amount === null ? null : Number(row.amount),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  },

  /**
   * Upsert do status do aluguel para (propertyId, mês corrente). O período é
   * SEMPRE recomputado no servidor — não aceitamos `period` do body/query
   * para bloquear edições retroativas via API (PRD US-010).
   *
   * `updatedBy` é o id do usuário autenticado (locador dono do imóvel). O
   * `updatedAt` é gerenciado pelo Prisma via `@updatedAt` em create/update.
   * `amount` é fotografado a partir do Contract.monthlyRent ACTIVE no momento
   * do write (LL-003); `null` quando não há contrato ativo. Retorna a mesma
   * forma de `getCurrent` para o UI reutilizar o renderer.
   */
  async upsertCurrent(
    propertyId: string,
    status: RentalPaymentStatus,
    updatedBy: string,
    now: Date = new Date(),
  ): Promise<RentalPaymentView> {
    const period = currentPeriod(now);
    const amount = await getActiveMonthlyRent(propertyId);
    const row = await prisma.rentalPayment.upsert({
      where: {
        rental_payments_property_period_key: { propertyId, period },
      },
      create: {
        propertyId,
        period,
        status,
        amount,
        updatedBy,
      },
      update: {
        status,
        amount,
        updatedBy,
      },
      select: {
        period: true,
        status: true,
        amount: true,
        updatedAt: true,
        updatedBy: true,
      },
    });

    return {
      period: row.period,
      status: row.status,
      amount: row.amount === null ? null : Number(row.amount),
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  },

  /**
   * US-007 / LL-009: histórico multi-mês de pagamentos para a dupla
   * (propertyId, tenantId).
   *
   * Busca TODOS os contratos entre esse inquilino e esse imóvel (independente
   * de `ContractStatus`, porque TERMINATED/COMPLETED ainda delimitam uma janela
   * legítima de tenure que o landlord quer ver) e enumera os meses YYYY-MM
   * que caem entre `startDate` e `min(endDate, currentMonth)` — inclusivo em
   * ambos, com o teto da "mês corrente" evitando renderizar linhas para
   * meses futuros de contratos ACTIVE longos.
   *
   * Para cada mês enumerado:
   *   - se existe um `RentalPayment` para (propertyId, period), usamos o
   *     status/amount/paidAt da linha (paidAt = updatedAt só quando
   *     status=PAID; caso contrário null).
   *   - se NÃO existe linha, sintetizamos uma entrada com:
   *         amount = contract.monthlyRent (Number — desserialização Decimal)
   *         status = LATE   (se period < currentPeriod — mês já passou)
   *                  AWAITING (se period === currentPeriod — mês corrente)
   *         paidAt = null
   *     A síntese garante que o UI de "histórico" sempre tem uma linha por
   *     mês de tenure, mesmo que o landlord nunca tenha feito upsert em
   *     PUT /payments/current para aquele mês.
   *
   * Ordem: `period DESC` (mais recente primeiro, como o UI espera).
   *
   * Retorno vazio quando não há nenhum contrato entre os dois — 200 `[]`,
   * nunca 404.
   *
   * O parâmetro `now` é injetável para facilitar testes determinísticos; em
   * produção recebe `new Date()` no default.
   */
  async listByTenant(
    propertyId: string,
    tenantId: string,
    now: Date = new Date(),
  ): Promise<RentalPaymentHistoryItem[]> {
    const contracts = await prisma.contract.findMany({
      where: { propertyId, tenantId },
      select: { startDate: true, endDate: true, monthlyRent: true },
    });

    if (contracts.length === 0) {
      return [];
    }

    const currentPeriodStr = currentPeriod(now);
    // Primeiro dia do mês corrente em UTC — usado para capar a enumeração
    // quando o contrato ainda está ACTIVE e endDate aponta para o futuro.
    const currentMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    // Mapa period → monthlyRent do contrato que cobre aquele mês. Em caso de
    // overlap (raríssimo, mas possível com contratos duplicados), o último
    // contrato iterado prevalece — dado determinístico e irrelevante para o
    // resultado porque o valor vem quase sempre do mesmo contrato.
    const periodToRent = new Map<string, number>();
    for (const c of contracts) {
      const effectiveEnd =
        c.endDate < currentMonthStart ? c.endDate : currentMonthStart;
      const rent = Number(c.monthlyRent);
      for (const period of enumerateMonthsUtcInclusive(c.startDate, effectiveEnd)) {
        periodToRent.set(period, rent);
      }
    }

    if (periodToRent.size === 0) {
      return [];
    }

    const rows = await prisma.rentalPayment.findMany({
      where: {
        propertyId,
        period: { in: Array.from(periodToRent.keys()) },
      },
      select: {
        period: true,
        amount: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { period: 'desc' },
    });

    const rowByPeriod = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      rowByPeriod.set(r.period, r);
    }

    const items: RentalPaymentHistoryItem[] = [];
    for (const [period, rent] of periodToRent) {
      const row = rowByPeriod.get(period);
      if (row) {
        items.push({
          period,
          amount: row.amount === null ? 0 : Number(row.amount),
          status: row.status,
          paidAt:
            row.status === RentalPaymentStatus.PAID
              ? row.updatedAt.toISOString()
              : null,
        });
      } else {
        const syntheticStatus =
          period < currentPeriodStr
            ? RentalPaymentStatus.LATE
            : RentalPaymentStatus.AWAITING;
        items.push({
          period,
          amount: rent,
          status: syntheticStatus,
          paidAt: null,
        });
      }
    }

    items.sort((a, b) => b.period.localeCompare(a.period));
    return items;
  },
};
