import { describe, it, expect, vi } from 'vitest';
import {
  getProcessInsights,
  type RentalProcessDeps,
} from '../src/services/rentalProcessService';

function makeDeps(opts: {
  process?: {
    id: string;
    tenantId: string;
    propertyId: string | null;
    status: string;
    insights: Array<{
      id: string;
      insightKey: string;
      insightValue: string;
      extractedAt: Date;
    }>;
  } | null;
}): { deps: RentalProcessDeps; findUnique: ReturnType<typeof vi.fn> } {
  const findUnique = vi.fn(async () => opts.process ?? null);
  return {
    deps: {
      prisma: {
        rentalProcess: { findUnique },
      } as unknown as RentalProcessDeps['prisma'],
    },
    findUnique,
  };
}

describe('getProcessInsights', () => {
  it('returns shaped payload when process exists', async () => {
    const { deps } = makeDeps({
      process: {
        id: 'rp-1',
        tenantId: 't-1',
        propertyId: null,
        status: 'TRIAGE',
        insights: [
          {
            id: 'i-1',
            insightKey: 'budget',
            insightValue: 'R$ 2.000',
            extractedAt: new Date('2026-04-25T10:00:00Z'),
          },
        ],
      },
    });

    const result = await getProcessInsights('rp-1', deps);

    expect(result).not.toBeNull();
    expect(result!.processId).toBe('rp-1');
    expect(result!.status).toBe('TRIAGE');
    expect(result!.tenantId).toBe('t-1');
    expect(result!.propertyId).toBeNull();
    expect(result!.insights).toHaveLength(1);
    expect(result!.insights[0].insightKey).toBe('budget');
  });

  it('returns null when process does not exist', async () => {
    const { deps } = makeDeps({ process: null });
    const result = await getProcessInsights('rp-missing', deps);
    expect(result).toBeNull();
  });

  it('orders insights by extractedAt asc', async () => {
    const { deps, findUnique } = makeDeps({
      process: {
        id: 'rp-1',
        tenantId: 't-1',
        propertyId: null,
        status: 'TRIAGE',
        insights: [],
      },
    });
    await getProcessInsights('rp-1', deps);
    const callArg = findUnique.mock.calls[0][0];
    expect(callArg.include.insights.orderBy).toEqual({ extractedAt: 'asc' });
  });
});
