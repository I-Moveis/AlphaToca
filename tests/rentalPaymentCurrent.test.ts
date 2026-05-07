import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// Firebase env vars must be present before importing app — validateAuthConfig
// runs at load time, and importing src/app transitively pulls in firebase init.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

const LANDLORD_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_LANDLORD_ID = '33333333-3333-3333-3333-333333333333';

const {
  mockGetPropertyById,
  mockGetCurrent,
  mockUpsertCurrent,
} = vi.hoisted(() => ({
  mockGetPropertyById: vi.fn(),
  mockGetCurrent: vi.fn(),
  mockUpsertCurrent: vi.fn(),
}));

// Same pattern as propertyUpdateMultipart: header-driven switch between "owner"
// and "intruder" so a single app instance exercises both the 200 and 403 paths.
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

vi.mock('../src/services/rentalPaymentService', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    rentalPaymentService: {
      ...actual.rentalPaymentService,
      getCurrent: mockGetCurrent,
      upsertCurrent: mockUpsertCurrent,
    },
  };
});

import request from 'supertest';
import app from '../src/app';

function seedProperty(overrides: Partial<any> = {}) {
  return {
    id: randomUUID(),
    landlordId: LANDLORD_ID,
    title: 'Seeded',
    description: 'A property seeded for rental-payment tests.',
    price: 3200,
    address: 'Rua Teste, 123',
    status: 'AVAILABLE',
    images: [],
    currentTenant: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/properties/:id/payments/current — US-009', () => {
  it('returns status=AWAITING and null updatedAt/updatedBy when no row exists', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);
    mockGetCurrent.mockResolvedValue({
      period: '2026-05',
      status: 'AWAITING',
      updatedAt: null,
      updatedBy: null,
    });

    const res = await request(app)
      .get(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: '2026-05',
      status: 'AWAITING',
      updatedAt: null,
      updatedBy: null,
    });
    expect(mockGetCurrent).toHaveBeenCalledWith(property.id);
  });

  it('returns stored values when a row exists', async () => {
    const property = seedProperty();
    const updatedAt = new Date('2026-05-03T14:22:10.000Z').toISOString();
    mockGetPropertyById.mockResolvedValue(property);
    mockGetCurrent.mockResolvedValue({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: LANDLORD_ID,
    });

    const res = await request(app)
      .get(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: LANDLORD_ID,
    });
  });

  it('returns 403 FORBIDDEN when a non-owner attempts to read', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .get(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-intruder');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    expect(mockGetCurrent).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when no Authorization header is sent', async () => {
    const res = await request(app).get(`/api/properties/${randomUUID()}/payments/current`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(mockGetPropertyById).not.toHaveBeenCalled();
    expect(mockGetCurrent).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when the property does not exist', async () => {
    mockGetPropertyById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/properties/${randomUUID()}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(mockGetCurrent).not.toHaveBeenCalled();
  });
});

describe('PUT /api/properties/:id/payments/current — US-010', () => {
  it('upserts and returns the full view in the same shape as GET', async () => {
    const property = seedProperty();
    const updatedAt = new Date('2026-05-07T12:00:00Z').toISOString();
    mockGetPropertyById.mockResolvedValue(property);
    mockUpsertCurrent.mockResolvedValue({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: LANDLORD_ID,
    });

    const res = await request(app)
      .put(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner')
      .send({ status: 'PAID' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      period: '2026-05',
      status: 'PAID',
      updatedAt,
      updatedBy: LANDLORD_ID,
    });
    // Contract: service receives (propertyId, status, userId) — never a period.
    expect(mockUpsertCurrent).toHaveBeenCalledWith(property.id, 'PAID', LANDLORD_ID);
  });

  it('accepts AWAITING and LATE in addition to PAID', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    for (const status of ['AWAITING', 'LATE'] as const) {
      mockUpsertCurrent.mockResolvedValueOnce({
        period: '2026-05',
        status,
        updatedAt: new Date('2026-05-07T12:00:00Z').toISOString(),
        updatedBy: LANDLORD_ID,
      });

      const res = await request(app)
        .put(`/api/properties/${property.id}/payments/current`)
        .set('Authorization', 'Bearer landlord-owner')
        .send({ status });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('returns 400 VALIDATION_ERROR for an invalid status value', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .put(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner')
      .send({ status: 'NOT_A_REAL_STATUS' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(mockUpsertCurrent).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when status is missing from the body', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .put(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(mockUpsertCurrent).not.toHaveBeenCalled();
  });

  it('returns 403 FORBIDDEN when a non-owner attempts to update', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .put(`/api/properties/${property.id}/payments/current`)
      .set('Authorization', 'Bearer landlord-intruder')
      .send({ status: 'PAID' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    expect(mockUpsertCurrent).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when no Authorization header is sent', async () => {
    const res = await request(app)
      .put(`/api/properties/${randomUUID()}/payments/current`)
      .send({ status: 'PAID' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(mockGetPropertyById).not.toHaveBeenCalled();
    expect(mockUpsertCurrent).not.toHaveBeenCalled();
  });

  it('returns 404 NOT_FOUND when the property does not exist', async () => {
    mockGetPropertyById.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/properties/${randomUUID()}/payments/current`)
      .set('Authorization', 'Bearer landlord-owner')
      .send({ status: 'PAID' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(mockUpsertCurrent).not.toHaveBeenCalled();
  });
});
