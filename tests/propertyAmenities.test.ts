import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

/**
 * US-016 — Property amenities (hasWifi + hasPool) AC-level coverage.
 *
 * The bulk of the amenity contract was already delivered by LL-021
 * (schema + migration) and LL-022 (validation + POST/PUT + search filter).
 * Existing files exercise those slices:
 *   - tests/propertyAmenitiesColumns.test.ts — Prisma column round-trip
 *   - tests/propertyAmenitiesFlow.test.ts   — POST/PUT/search HTTP flow
 *
 * This file fills the two AC gaps those didn't cover explicitly:
 *   1. GET /api/properties/:id returns both hasWifi + hasPool in the body.
 *   2. prisma/seed.ts (demoData.ts) sets hasWifi/hasPool on every demo
 *      property with a realistic distribution (so `?hasWifi=true` /
 *      `?hasPool=true` demos actually return a non-empty + non-exhaustive
 *      set of rows).
 */

const { mockGetPropertyById, mockPropertyViewRecord, mockProfileViewRecord } = vi.hoisted(() => ({
  mockGetPropertyById: vi.fn(),
  mockPropertyViewRecord: vi.fn(),
  mockProfileViewRecord: vi.fn(),
}));

vi.mock('../src/middlewares/authMiddleware', () => ({
  validateAuthConfig: () => {},
  checkJwt: (_req: any, _res: any, next: any) => next(),
  authSyncMiddleware: (_req: any, _res: any, next: any) => next(),
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

vi.mock('../src/services/propertyViewService', () => ({
  propertyViewService: { record: mockPropertyViewRecord },
}));

vi.mock('../src/services/profileViewService', () => ({
  profileViewService: { record: mockProfileViewRecord },
}));

vi.mock('../src/config/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import request from 'supertest';
import app from '../src/app';
import { demoProperties } from '../prisma/demoData';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('US-016 — GET /api/properties/:id response exposes hasWifi + hasPool', () => {
  it('returns both amenity flags in the 200 body (both true)', async () => {
    const id = randomUUID();
    mockGetPropertyById.mockResolvedValue({
      id,
      landlordId: randomUUID(),
      title: 'Amenities on',
      description: 'wifi + pool',
      price: 3500,
      address: 'Rua Demo, 1',
      status: 'AVAILABLE',
      moderationStatus: 'APPROVED',
      hasWifi: true,
      hasPool: true,
      images: [],
      currentTenant: null,
    });

    const res = await request(app).get(`/api/properties/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasWifi', true);
    expect(res.body).toHaveProperty('hasPool', true);
    expect(mockGetPropertyById).toHaveBeenCalledWith(id);
  });

  it('returns both amenity flags in the 200 body (both false)', async () => {
    const id = randomUUID();
    mockGetPropertyById.mockResolvedValue({
      id,
      landlordId: randomUUID(),
      title: 'No amenities',
      description: 'nothing',
      price: 1800,
      address: 'Rua Simples, 55',
      status: 'AVAILABLE',
      moderationStatus: 'APPROVED',
      hasWifi: false,
      hasPool: false,
      images: [],
      currentTenant: null,
    });

    const res = await request(app).get(`/api/properties/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('hasWifi', false);
    expect(res.body).toHaveProperty('hasPool', false);
  });

  it('returns both amenity flags when they are mixed (hasWifi=true, hasPool=false)', async () => {
    const id = randomUUID();
    mockGetPropertyById.mockResolvedValue({
      id,
      landlordId: randomUUID(),
      title: 'Wifi only',
      description: 'wifi sem piscina',
      price: 2500,
      address: 'Rua Mid, 10',
      status: 'AVAILABLE',
      moderationStatus: 'APPROVED',
      hasWifi: true,
      hasPool: false,
      images: [],
      currentTenant: null,
    });

    const res = await request(app).get(`/api/properties/${id}`);

    expect(res.status).toBe(200);
    expect(res.body.hasWifi).toBe(true);
    expect(res.body.hasPool).toBe(false);
  });
});

describe('US-016 — prisma/seed.ts (demoData) sets hasWifi + hasPool for every demo property', () => {
  it('every demo property declares both amenity flags explicitly (no DB default reliance)', () => {
    expect(demoProperties.length).toBeGreaterThan(0);
    for (const p of demoProperties) {
      expect(p).toHaveProperty('hasWifi');
      expect(p).toHaveProperty('hasPool');
      expect(typeof (p as any).hasWifi).toBe('boolean');
      expect(typeof (p as any).hasPool).toBe('boolean');
    }
  });

  it('seed data has at least one property with hasWifi=true (enables ?hasWifi=true demos)', () => {
    const wifiTrue = demoProperties.filter((p: any) => p.hasWifi === true);
    expect(wifiTrue.length).toBeGreaterThan(0);
  });

  it('seed data has at least one property with hasPool=true (enables ?hasPool=true demos)', () => {
    const poolTrue = demoProperties.filter((p: any) => p.hasPool === true);
    expect(poolTrue.length).toBeGreaterThan(0);
  });

  it('seed data has at least one property with hasWifi=false (enables hasWifi=false demos)', () => {
    const wifiFalse = demoProperties.filter((p: any) => p.hasWifi === false);
    expect(wifiFalse.length).toBeGreaterThan(0);
  });

  it('seed data has at least one property with hasPool=false (non-exhaustive pool filter)', () => {
    const poolFalse = demoProperties.filter((p: any) => p.hasPool === false);
    expect(poolFalse.length).toBeGreaterThan(0);
  });

  it('seed data has at least one property with BOTH hasWifi=true AND hasPool=true (AND-filter demo)', () => {
    const both = demoProperties.filter((p: any) => p.hasWifi === true && p.hasPool === true);
    expect(both.length).toBeGreaterThan(0);
  });
});
