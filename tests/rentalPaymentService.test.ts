import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/db', () => ({
  default: {
    rentalPayment: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../src/config/db';
import { rentalPaymentService, currentPeriod } from '../src/services/rentalPaymentService';

const mockFindUnique = (prisma.rentalPayment.findUnique as any) as ReturnType<typeof vi.fn>;

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
