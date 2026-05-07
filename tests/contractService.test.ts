import { describe, it, expect, vi, beforeEach } from 'vitest';

// Service-level coverage for contractService.getActiveContractByPropertyAndTenant
// (US-014). Mocks the prisma client directly so the service's where/select
// shape and Decimal→number + Date→ISO transforms can be asserted without a DB.

const { prismaContractFindFirst } = vi.hoisted(() => ({
  prismaContractFindFirst: vi.fn(),
}));

vi.mock('../src/config/db', () => ({
  default: {
    contract: { findFirst: prismaContractFindFirst },
  },
}));

describe('contractService.getActiveContractByPropertyAndTenant — US-014', () => {
  beforeEach(() => {
    prismaContractFindFirst.mockReset();
  });

  it('queries with status=ACTIVE filter and returns the projected view (Decimal → number, Date → ISO)', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaContractFindFirst.mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      propertyId: '11111111-1111-1111-1111-111111111111',
      tenantId: '33333333-3333-3333-3333-333333333333',
      landlordId: '22222222-2222-2222-2222-222222222222',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      monthlyRent: new Prisma.Decimal('2500.00'),
      pdfUrl: null,
      signedAt: null,
    });

    const { getActiveContractByPropertyAndTenant } = await import(
      '../src/services/contractService'
    );
    const result = await getActiveContractByPropertyAndTenant(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(prismaContractFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          propertyId: '11111111-1111-1111-1111-111111111111',
          tenantId: '33333333-3333-3333-3333-333333333333',
          status: 'ACTIVE',
        },
      }),
    );
    expect(result).toEqual({
      id: '55555555-5555-5555-5555-555555555555',
      propertyId: '11111111-1111-1111-1111-111111111111',
      tenantId: '33333333-3333-3333-3333-333333333333',
      landlordId: '22222222-2222-2222-2222-222222222222',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2027-01-01T00:00:00.000Z',
      monthlyRent: 2500,
      pdfUrl: null,
      signedAt: null,
    });
    expect(typeof result!.monthlyRent).toBe('number');
  });

  it('returns null when no ACTIVE contract exists (so the controller can 404 CONTRACT_NOT_FOUND)', async () => {
    prismaContractFindFirst.mockResolvedValue(null);
    const { getActiveContractByPropertyAndTenant } = await import(
      '../src/services/contractService'
    );

    const result = await getActiveContractByPropertyAndTenant(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(result).toBeNull();
  });

  it('serializes pdfUrl and signedAt when populated', async () => {
    const { Prisma } = await import('@prisma/client');
    prismaContractFindFirst.mockResolvedValue({
      id: '55555555-5555-5555-5555-555555555555',
      propertyId: '11111111-1111-1111-1111-111111111111',
      tenantId: '33333333-3333-3333-3333-333333333333',
      landlordId: '22222222-2222-2222-2222-222222222222',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      monthlyRent: new Prisma.Decimal('3100.50'),
      pdfUrl: '/uploads/contracts/55555555.pdf',
      signedAt: new Date('2026-04-15T12:00:00.000Z'),
    });

    const { getActiveContractByPropertyAndTenant } = await import(
      '../src/services/contractService'
    );
    const result = await getActiveContractByPropertyAndTenant(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(result!.pdfUrl).toBe('/uploads/contracts/55555555.pdf');
    expect(result!.signedAt).toBe('2026-04-15T12:00:00.000Z');
    expect(result!.monthlyRent).toBe(3100.5);
  });

  it('orders results by createdAt DESC so the most recent ACTIVE contract wins if multiple exist', async () => {
    prismaContractFindFirst.mockResolvedValue(null);
    const { getActiveContractByPropertyAndTenant } = await import(
      '../src/services/contractService'
    );

    await getActiveContractByPropertyAndTenant(
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
    );

    expect(prismaContractFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
    );
  });
});
