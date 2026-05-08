import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { PropertyType } from '@prisma/client';

// Firebase env vars must be present before importing app — validateAuthConfig
// runs at load time, and importing src/app transitively pulls in firebase init.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

/**
 * US-015 — PropertyType enum expansion end-to-end coverage.
 *
 * LL-019 already landed the enum values (KITNET, PENTHOUSE, LAND, COMMERCIAL)
 * in the Prisma schema + migration and tests/propertyTypeExtended.test.ts
 * locked in the POST/migration/Zod-accept surface; LL-020 added
 * tests/propertySearchExtendedTypes.test.ts for the GET /search filter.
 *
 * This file closes the remaining US-015 AC items:
 *   1. PUT /api/properties/:id accepts each of the 4 new enum values via the
 *      updated `updatePropertySchema` (the schema previously did NOT accept
 *      `type` at all — this was the real behavioral gap).
 *   2. prisma/demoData.ts now seeds at least one property per new type
 *      (KITNET/PENTHOUSE/LAND/COMMERCIAL) — assertion on the export.
 *   3. Regression guard: PUT still rejects unknown enum values (TREE_HOUSE)
 *      with 400 VALIDATION_ERROR.
 */

const LANDLORD_ID = '44444444-4444-4444-8444-444444444444';

const { mockGetPropertyById, mockUpdateProperty } = vi.hoisted(() => ({
  mockGetPropertyById: vi.fn(),
  mockUpdateProperty: vi.fn(),
}));

vi.mock('../src/middlewares/authMiddleware', () => ({
  validateAuthConfig: () => {},
  checkJwt: (req: any, res: any, next: any) => {
    if (req.headers.authorization === 'Bearer landlord-owner') {
      req.auth = { payload: { uid: 'landlord-owner' } };
      return next();
    }
    return res.status(401).json({
      status: 401,
      code: 'UNAUTHORIZED',
      messages: [{ message: 'Missing or invalid Authorization header.' }],
    });
  },
  authSyncMiddleware: (req: any, _res: any, next: any) => {
    req.localUser = {
      id: LANDLORD_ID,
      firebaseUid: 'landlord-owner',
      name: 'Owner Landlord',
      email: 'owner@demo.com',
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
      updateProperty: mockUpdateProperty,
    },
  };
});

vi.mock('../src/config/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import request from 'supertest';
import app from '../src/app';

beforeEach(() => {
  vi.clearAllMocks();
});

const NEW_TYPES = [
  PropertyType.KITNET,
  PropertyType.PENTHOUSE,
  PropertyType.LAND,
  PropertyType.COMMERCIAL,
] as const;

describe('US-015 — PUT /api/properties/:id accepts each new PropertyType value', () => {
  it.each(NEW_TYPES)('200 OK + forwards type=%s to propertyService.updateProperty', async (type) => {
    const propertyId = randomUUID();
    const existing = {
      id: propertyId,
      landlordId: LANDLORD_ID,
      title: 'Existing Property',
      description: 'Seeded for US-015 PUT coverage.',
      type: PropertyType.APARTMENT,
      status: 'AVAILABLE',
      images: [],
    };
    mockGetPropertyById.mockResolvedValue(existing);
    mockUpdateProperty.mockImplementation(async (_id: string, data: any) => ({
      ...existing,
      ...data,
    }));

    const res = await request(app)
      .put(`/api/properties/${propertyId}`)
      .set('Authorization', 'Bearer landlord-owner')
      .set('Content-Type', 'application/json')
      .send({ type });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe(type);
    expect(mockUpdateProperty).toHaveBeenCalledTimes(1);
    const [, dataArg] = mockUpdateProperty.mock.calls[0];
    expect(dataArg.type).toBe(type);
  });

  it('rejects unknown type values at the Zod layer (400 VALIDATION_ERROR)', async () => {
    const propertyId = randomUUID();
    mockGetPropertyById.mockResolvedValue({
      id: propertyId,
      landlordId: LANDLORD_ID,
      title: 'Existing Property',
      description: 'Rejection fixture.',
      type: PropertyType.APARTMENT,
      status: 'AVAILABLE',
      images: [],
    });

    const res = await request(app)
      .put(`/api/properties/${propertyId}`)
      .set('Authorization', 'Bearer landlord-owner')
      .set('Content-Type', 'application/json')
      .send({ type: 'TREE_HOUSE' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it('Zod updatePropertySchema accepts each of the 4 new enum values directly', async () => {
    const { updatePropertySchema } = await import('../src/utils/propertyValidation');
    for (const type of NEW_TYPES) {
      const parsed = updatePropertySchema.parse({ type });
      expect(parsed.type).toBe(type);
    }
  });
});

describe('US-015 — demoData seeds cover each new PropertyType value', () => {
  it('prisma/demoData.ts exports at least one property per new type', async () => {
    const { demoProperties } = await import('../prisma/demoData');
    const seededTypes = new Set(demoProperties.map((p) => p.type));
    for (const type of NEW_TYPES) {
      expect(seededTypes.has(type)).toBe(true);
    }
  });

  it('each seeded new-type property has a UUID-v4 id and demo landlordId', async () => {
    const { demoProperties } = await import('../prisma/demoData');
    const UUID_V4_REGEX =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    for (const type of NEW_TYPES) {
      const seed = demoProperties.find((p) => p.type === type);
      expect(seed).toBeDefined();
      expect(seed!.id).toMatch(UUID_V4_REGEX);
      expect(typeof seed!.landlordId).toBe('string');
      expect(seed!.landlordId.length).toBeGreaterThan(0);
    }
  });
});
