import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// Firebase env vars must be present before importing src/app — validateAuthConfig
// runs at load time.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

// US-007: tests for the multi-month payment history endpoint, focused on the
// behavior the AC explicitly calls out: synthesizing LATE/AWAITING rows for
// contract months without a RentalPayment. The sibling rentalPaymentsList.test.ts
// / rentalPaymentsListService.test.ts cover the same endpoint's plumbing and
// edge cases from the LL-009 rollout — do not duplicate those here.

const LANDLORD_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_LANDLORD_ID = '33333333-3333-3333-3333-333333333333';
const TENANT_ID = '44444444-4444-4444-4444-444444444444';
const PROPERTY_ID = '55555555-5555-5555-5555-555555555555';

// Mocks exposed to every describe block below.
const {
  mockGetPropertyById,
  mockContractFindMany,
  mockRentalFindMany,
} = vi.hoisted(() => ({
  mockGetPropertyById: vi.fn(),
  mockContractFindMany: vi.fn(),
  mockRentalFindMany: vi.fn(),
}));

// Header-driven owner/intruder switch (same pattern as rentalPaymentsList.test.ts).
vi.mock('../src/middlewares/authMiddleware', () => ({
  validateAuthConfig: () => {},
  checkJwt: (req: any, res: any, next: any) => {
    const header = req.headers.authorization;
    if (header === 'Bearer landlord-owner' || header === 'Bearer landlord-intruder') {
      req.auth = { payload: { uid: header } };
      return next();
    }
    return res.status(401).json({
      status: 401,
      code: 'UNAUTHORIZED',
      messages: [{ message: 'Missing or invalid Authorization header.' }],
    });
  },
  authSyncMiddleware: (req: any, _res: any, next: any) => {
    const isOwner = req.auth?.payload?.uid === 'Bearer landlord-owner';
    req.localUser = {
      id: isOwner ? LANDLORD_ID : OTHER_LANDLORD_ID,
      firebaseUid: req.auth?.payload?.uid ?? 'unknown',
      name: isOwner ? 'Owner Landlord' : 'Intruder Landlord',
      email: isOwner ? 'owner@demo.com' : 'intruder@demo.com',
      phoneNumber: '+5511999999000',
      role: 'LANDLORD',
      fcmToken: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../src/services/propertyService', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    propertyService: {
      ...actual.propertyService,
      getPropertyById: mockGetPropertyById,
    },
  };
});

// Mock prisma directly so the real rentalPaymentService runs end-to-end
// (including enumeration + synthesis), with only DB calls stubbed.
vi.mock('../src/config/db', () => ({
  default: {
    contract: { findMany: mockContractFindMany },
    rentalPayment: { findMany: mockRentalFindMany },
  },
}));

import request from 'supertest';
import app from '../src/app';
import { rentalPaymentService } from '../src/services/rentalPaymentService';

function seedProperty() {
  return {
    id: PROPERTY_ID,
    landlordId: LANDLORD_ID,
    title: 'Seeded',
    description: 'For US-007 payment-history tests.',
    price: 3200,
    address: 'Rua Teste, 123',
    status: 'AVAILABLE',
    images: [],
    currentTenant: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/properties/:propertyId/payments — US-007 synthesis', () => {
  it('contract with 3 months, 2 paid + 1 late: synthesizes LATE for the unpaid past month', async () => {
    // Contract ran Feb..Apr 2026; today is some day in 2026-05. Feb and Mar
    // were paid; April has no RentalPayment row, so the service must
    // synthesize it as LATE (period 2026-04 < currentPeriod 2026-05).
    mockGetPropertyById.mockResolvedValue(seedProperty());
    mockContractFindMany.mockResolvedValue([
      {
        startDate: new Date('2026-02-01T00:00:00Z'),
        endDate: new Date('2026-04-30T23:59:59Z'),
        monthlyRent: '3200.00',
      },
    ]);
    const paidFeb = new Date('2026-02-05T10:00:00Z');
    const paidMar = new Date('2026-03-04T09:00:00Z');
    mockRentalFindMany.mockResolvedValue([
      { period: '2026-03', amount: '3200.00', status: 'PAID', updatedAt: paidMar },
      { period: '2026-02', amount: '3200.00', status: 'PAID', updatedAt: paidFeb },
    ]);

    const res = await request(app)
      .get(`/api/properties/${PROPERTY_ID}/payments`)
      .query({ tenantId: TENANT_ID })
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    // Ordered period DESC: April LATE (synthesized) → March PAID → February PAID.
    expect(res.body[0]).toEqual({
      period: '2026-04',
      amount: 3200,
      status: 'LATE',
      paidAt: null,
    });
    expect(res.body[1]).toEqual({
      period: '2026-03',
      amount: 3200,
      status: 'PAID',
      paidAt: paidMar.toISOString(),
    });
    expect(res.body[2]).toEqual({
      period: '2026-02',
      amount: 3200,
      status: 'PAID',
      paidAt: paidFeb.toISOString(),
    });
  });

  it('returns 400 VALIDATION_ERROR when tenantId is missing from the query', async () => {
    mockGetPropertyById.mockResolvedValue(seedProperty());

    const res = await request(app)
      .get(`/api/properties/${PROPERTY_ID}/payments`)
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(mockContractFindMany).not.toHaveBeenCalled();
    expect(mockRentalFindMany).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when the property does not exist', async () => {
    mockGetPropertyById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/properties/${randomUUID()}/payments`)
      .query({ tenantId: TENANT_ID })
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(mockContractFindMany).not.toHaveBeenCalled();
    expect(mockRentalFindMany).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when a non-owner landlord tries to read the history', async () => {
    mockGetPropertyById.mockResolvedValue(seedProperty());

    const res = await request(app)
      .get(`/api/properties/${PROPERTY_ID}/payments`)
      .query({ tenantId: TENANT_ID })
      .set('Authorization', 'Bearer landlord-intruder');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    expect(mockContractFindMany).not.toHaveBeenCalled();
    expect(mockRentalFindMany).not.toHaveBeenCalled();
  });
});

describe('rentalPaymentService.listByTenant — US-007 synthesis edges', () => {
  it('synthesizes AWAITING for the current month when unpaid (not LATE)', async () => {
    // Contract Apr..Jun 2026, "now" = 2026-05-15. April is past (LATE if
    // unpaid), May is current (AWAITING if unpaid). We inject both to
    // exercise the period-comparison branch.
    mockContractFindMany.mockResolvedValue([
      {
        startDate: new Date('2026-04-01T00:00:00Z'),
        endDate: new Date('2026-06-30T23:59:59Z'),
        monthlyRent: '2500.00',
      },
    ]);
    mockRentalFindMany.mockResolvedValue([]);

    const now = new Date('2026-05-15T12:00:00Z');
    const result = await rentalPaymentService.listByTenant(
      PROPERTY_ID,
      TENANT_ID,
      now,
    );

    // Contract endDate is in the future (June 2026) but the service caps at
    // the current month — only April and May appear.
    expect(result).toEqual([
      { period: '2026-05', amount: 2500, status: 'AWAITING', paidAt: null },
      { period: '2026-04', amount: 2500, status: 'LATE', paidAt: null },
    ]);
  });

  it('mixed: existing RentalPayment rows take precedence; missing months are synthesized', async () => {
    // Contract Mar..May 2026; "now" = 2026-05-07. DB has PAID for March and
    // April; May has no row → synthesize AWAITING (current month).
    mockContractFindMany.mockResolvedValue([
      {
        startDate: new Date('2026-03-01T00:00:00Z'),
        endDate: new Date('2026-05-31T23:59:59Z'),
        monthlyRent: '3500.50',
      },
    ]);
    const paidMar = new Date('2026-03-03T10:00:00Z');
    const paidApr = new Date('2026-04-02T09:00:00Z');
    mockRentalFindMany.mockResolvedValue([
      { period: '2026-04', amount: '3500.50', status: 'PAID', updatedAt: paidApr },
      { period: '2026-03', amount: '3500.50', status: 'PAID', updatedAt: paidMar },
    ]);

    const now = new Date('2026-05-07T12:00:00Z');
    const result = await rentalPaymentService.listByTenant(
      PROPERTY_ID,
      TENANT_ID,
      now,
    );

    expect(result).toEqual([
      { period: '2026-05', amount: 3500.5, status: 'AWAITING', paidAt: null },
      { period: '2026-04', amount: 3500.5, status: 'PAID', paidAt: paidApr.toISOString() },
      { period: '2026-03', amount: 3500.5, status: 'PAID', paidAt: paidMar.toISOString() },
    ]);
  });

  it('synthesized amount comes from contract.monthlyRent (Decimal → number)', async () => {
    // All months synthesized — ensure every row's amount is the numeric form
    // of the contract's monthlyRent, not 0 (which would indicate the fallback
    // for null RentalPayment.amount was taken instead).
    mockContractFindMany.mockResolvedValue([
      {
        startDate: new Date('2026-01-01T00:00:00Z'),
        endDate: new Date('2026-02-28T23:59:59Z'),
        monthlyRent: '1875.75',
      },
    ]);
    mockRentalFindMany.mockResolvedValue([]);

    const now = new Date('2026-05-07T12:00:00Z');
    const result = await rentalPaymentService.listByTenant(
      PROPERTY_ID,
      TENANT_ID,
      now,
    );

    // Both months are past (< 2026-05) → LATE with synthesized amount.
    expect(result).toEqual([
      { period: '2026-02', amount: 1875.75, status: 'LATE', paidAt: null },
      { period: '2026-01', amount: 1875.75, status: 'LATE', paidAt: null },
    ]);
  });
});
