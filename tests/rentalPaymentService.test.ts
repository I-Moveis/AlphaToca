import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/db', () => ({
  default: {
    rentalPayment: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import prisma from '../src/config/db';
import { rentalPaymentService, currentPeriod } from '../src/services/rentalPaymentService';

const mockFindUnique = (prisma.rentalPayment.findUnique as any) as ReturnType<typeof vi.fn>;
const mockUpsert = (prisma.rentalPayment.upsert as any) as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('currentPeriod()', () => {
  it('formats YYYY-MM from the passed date (server tz, UTC)', () => {
    expect(currentPeriod(new Date('2026-05-07T12:34:56Z'))).toBe('2026-05');
    expect(currentPeriod(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(currentPeriod(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });

  it('zero-pads single-digit months', () => {
    expect(currentPeriod(new Date('2026-03-15T10:00:00Z'))).toMatch(/^\d{4}-03$/);
  });
});

describe('rentalPaymentService.getCurrent()', () => {
  it('returns the default AWAITING shape when no row exists, without persisting anything', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await rentalPaymentService.getCurrent(
      'property-1',
      new Date('2026-05-07T12:00:00Z'),
    );

    expect(result).toEqual({
      period: '2026-05',
      status: 'AWAITING',
      updatedAt: null,
      updatedBy: null,
    });
    // Confirm the service uses the compound-unique (propertyId, period) key.
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: {
        rental_payments_property_period_key: {
          propertyId: 'property-1',
          period: '2026-05',
        },
      },
      select: {
        period: true,
        status: true,
        updatedAt: true,
        updatedBy: true,
      },
    });
  });

  it('returns stored values (ISO-serialized updatedAt) when a row exists', async () => {
    const updatedAt = new Date('2026-05-03T14:22:10Z');
    mockFindUnique.mockResolvedValue({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: '22222222-2222-2222-2222-222222222222',
    });

    const result = await rentalPaymentService.getCurrent(
      'property-1',
      new Date('2026-05-07T12:00:00Z'),
    );

    expect(result).toEqual({
      period: '2026-05',
      status: 'PAID',
      updatedAt: updatedAt.toISOString(),
      updatedBy: '22222222-2222-2222-2222-222222222222',
    });
  });

  it('preserves null updatedBy on stored rows that were never linked to a user', async () => {
    mockFindUnique.mockResolvedValue({
      period: '2026-05',
      status: 'LATE',
      updatedAt: new Date('2026-05-05T10:00:00Z'),
      updatedBy: null,
    });

    const result = await rentalPaymentService.getCurrent('property-1');

    expect(result.status).toBe('LATE');
    expect(result.updatedBy).toBeNull();
    expect(typeof result.updatedAt).toBe('string');
  });
});

describe('rentalPaymentService.upsertCurrent()', () => {
  const PROPERTY_ID = 'property-1';
  const USER_ID = '22222222-2222-2222-2222-222222222222';

  it('upserts using the compound-unique (propertyId, period) key and server-computed period', async () => {
    const updatedAt = new Date('2026-05-07T12:00:00Z');
    mockUpsert.mockResolvedValue({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: USER_ID,
    });

    const result = await rentalPaymentService.upsertCurrent(
      PROPERTY_ID,
      'PAID',
      USER_ID,
      new Date('2026-05-07T12:00:00Z'),
    );

    expect(result).toEqual({
      period: '2026-05',
      status: 'PAID',
      updatedAt: updatedAt.toISOString(),
      updatedBy: USER_ID,
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: {
        rental_payments_property_period_key: {
          propertyId: PROPERTY_ID,
          period: '2026-05',
        },
      },
      create: {
        propertyId: PROPERTY_ID,
        period: '2026-05',
        status: 'PAID',
        updatedBy: USER_ID,
      },
      update: {
        status: 'PAID',
        updatedBy: USER_ID,
      },
      select: {
        period: true,
        status: true,
        updatedAt: true,
        updatedBy: true,
      },
    });
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('returns ISO-serialized updatedAt from the upsert result', async () => {
    const updatedAt = new Date('2026-11-15T09:30:00Z');
    mockUpsert.mockResolvedValue({
      period: '2026-11',
      status: 'LATE',
      updatedAt,
      updatedBy: USER_ID,
    });

    const result = await rentalPaymentService.upsertCurrent(
      PROPERTY_ID,
      'LATE',
      USER_ID,
      new Date('2026-11-15T09:30:00Z'),
    );

    expect(result.period).toBe('2026-11');
    expect(result.status).toBe('LATE');
    expect(result.updatedAt).toBe(updatedAt.toISOString());
  });

  it('ignores any period the caller might hint at — always uses currentPeriod(now)', async () => {
    mockUpsert.mockResolvedValue({
      period: '2026-01',
      status: 'AWAITING',
      updatedAt: new Date('2026-01-20T00:00:00Z'),
      updatedBy: USER_ID,
    });

    await rentalPaymentService.upsertCurrent(
      PROPERTY_ID,
      'AWAITING',
      USER_ID,
      new Date('2026-01-20T00:00:00Z'),
    );

    const call = mockUpsert.mock.calls[0][0];
    expect(call.where.rental_payments_property_period_key.period).toBe('2026-01');
    expect(call.create.period).toBe('2026-01');
  });
});
