import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';

// Firebase env vars must be present before importing app.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

// Simulate a tiny in-memory backing store so we can chain
// POST → PUT → GET /:id → GET /search and verify status round-trips.
const store = new Map<string, any>();

const LANDLORD_ID = '11111111-1111-1111-1111-111111111111';

const { mockCreateProperty, mockUpdateProperty, mockGetPropertyById, mockSearchProperties } =
  vi.hoisted(() => ({
    mockCreateProperty: vi.fn(),
    mockUpdateProperty: vi.fn(),
    mockGetPropertyById: vi.fn(),
    mockSearchProperties: vi.fn(),
  }));

// US-006 added auth (checkJwt + authSyncMiddleware) to PUT /properties/:id.
// Replace the middleware so tests here can drive the endpoint without a real
// Firebase token; localUser.id is set to LANDLORD_ID so the ownership guard
// in the controller passes against properties created with that landlordId.
vi.mock('../src/middlewares/authMiddleware', () => ({
  validateAuthConfig: () => {},
  checkJwt: (req: any, _res: any, next: any) => {
    req.auth = { payload: { uid: 'firebase-uid-demo-landlord-1' } };
    return next();
  },
  authSyncMiddleware: (req: any, _res: any, next: any) => {
    req.localUser = {
      id: LANDLORD_ID,
      firebaseUid: 'firebase-uid-demo-landlord-1',
      name: 'Demo Landlord',
      email: 'landlord1@demo.com',
      phoneNumber: '+5511999999001',
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
      createProperty: mockCreateProperty,
      updateProperty: mockUpdateProperty,
      getPropertyById: mockGetPropertyById,
      searchProperties: mockSearchProperties,
    },
  };
});

import request from 'supertest';
import app from '../src/app';

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();

  mockCreateProperty.mockImplementation(async (data: any) => {
    const id = randomUUID();
    // Prisma applies the @default(AVAILABLE) when status is absent; the Zod
    // createPropertySchema also fills AVAILABLE as the default. Mirror that.
    const record = {
      id,
      landlordId: data.landlordId,
      title: data.title,
      description: data.description,
      price: data.price,
      address: data.address,
      status: data.status ?? 'AVAILABLE',
      images: [],
    };
    store.set(id, record);
    return record;
  });

  mockUpdateProperty.mockImplementation(async (id: string, data: any) => {
    const existing = store.get(id);
    if (!existing) return null;
    // Prisma's property.update only overwrites provided keys — mimic that so
    // PUT with just { status } preserves the rest of the record.
    const updated = { ...existing, ...data };
    store.set(id, updated);
    return updated;
  });

  mockGetPropertyById.mockImplementation(async (id: string) => {
    return store.get(id) ?? null;
  });

  mockSearchProperties.mockImplementation(async (params: any) => {
    const data = Array.from(store.values()).filter(
      (p) => !params.landlordId || p.landlordId === params.landlordId,
    );
    return {
      data,
      meta: { total: data.length, page: 1, limit: 10, totalPages: 1 },
    };
  });
});

describe('Property.status round-trip (US-003)', () => {
  it('create → PUT status=NEGOTIATING → GET /:id returns NEGOTIATING → GET /search item has NEGOTIATING', async () => {
    // POST create — no status in body, defaults to AVAILABLE
    const createRes = await request(app)
      .post('/api/properties')
      .send({
        landlordId: LANDLORD_ID,
        title: 'US-003 Test Property',
        description: 'A property to verify status round-trips through the API.',
        price: 2500,
        address: 'Rua das Flores, 123, São Paulo - SP',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('AVAILABLE');
    const propertyId = createRes.body.id;

    // PUT update with status=NEGOTIATING (only field in body — tests that
    // updatePropertySchema accepts status on its own).
    const putRes = await request(app)
      .put(`/api/properties/${propertyId}`)
      .send({ status: 'NEGOTIATING' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.status).toBe('NEGOTIATING');
    expect(mockUpdateProperty).toHaveBeenCalledWith(
      propertyId,
      expect.objectContaining({ status: 'NEGOTIATING' }),
      undefined,
    );

    // GET /:id reflects the update
    const getByIdRes = await request(app).get(`/api/properties/${propertyId}`);
    expect(getByIdRes.status).toBe(200);
    expect(getByIdRes.body).toHaveProperty('status', 'NEGOTIATING');

    // GET /search also exposes status per item
    const searchRes = await request(app)
      .get('/api/properties/search')
      .query({ landlordId: LANDLORD_ID });

    expect(searchRes.status).toBe(200);
    const items = searchRes.body.data as any[];
    expect(items.length).toBeGreaterThanOrEqual(1);
    const found = items.find((p) => p.id === propertyId);
    expect(found).toBeDefined();
    expect(found.status).toBe('NEGOTIATING');
  });

  it('PUT with status=RENTED is accepted and persisted', async () => {
    const createRes = await request(app)
      .post('/api/properties')
      .send({
        landlordId: LANDLORD_ID,
        title: 'Another Test Property',
        description: 'A second property for status coverage.',
        price: 3200,
        address: 'Av. Paulista, 1000, São Paulo - SP',
      });
    const propertyId = createRes.body.id;

    const putRes = await request(app)
      .put(`/api/properties/${propertyId}`)
      .send({ status: 'RENTED' });

    expect(putRes.status).toBe(200);
    expect(putRes.body.status).toBe('RENTED');

    const getRes = await request(app).get(`/api/properties/${propertyId}`);
    expect(getRes.body.status).toBe('RENTED');
  });

  it('PUT with an invalid status string returns 400 VALIDATION_ERROR', async () => {
    const createRes = await request(app)
      .post('/api/properties')
      .send({
        landlordId: LANDLORD_ID,
        title: 'Validation Test Property',
        description: 'Used to assert Zod rejects invalid PropertyStatus values.',
        price: 1800,
        address: 'Rua Teste, 10, São Paulo - SP',
      });
    const propertyId = createRes.body.id;

    const putRes = await request(app)
      .put(`/api/properties/${propertyId}`)
      .send({ status: 'NOT_A_REAL_STATUS' });

    expect(putRes.status).toBe(400);
    expect(putRes.body).toHaveProperty('code', 'VALIDATION_ERROR');
    // Service layer must not be hit when Zod rejects.
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });
});
