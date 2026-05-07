import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Firebase env vars must be present before importing app — validateAuthConfig
// runs at load time, and importing src/app transitively pulls in firebase init.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

const LANDLORD_ID = '22222222-2222-2222-2222-222222222222';
const OTHER_LANDLORD_ID = '33333333-3333-3333-3333-333333333333';

const {
  mockGetPropertyById,
  mockUpdateProperty,
  createdPropertyIds,
} = vi.hoisted(() => ({
  mockGetPropertyById: vi.fn(),
  mockUpdateProperty: vi.fn(),
  createdPropertyIds: new Set<string>(),
}));

// Drive auth entirely through a header: `Bearer landlord-owner` becomes the
// owner of properties fetched by id; `Bearer landlord-intruder` authenticates
// but fails the ownership guard in the controller (403 path).
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
      updateProperty: mockUpdateProperty,
    },
  };
});

import request from 'supertest';
import app from '../src/app';

// Minimal valid JPEG (SOI + EOI). Multer's fileFilter only inspects the
// multipart part's Content-Type header, so a tiny buffer is enough.
const TINY_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

function seedProperty(overrides: Partial<any> = {}) {
  const id = randomUUID();
  createdPropertyIds.add(id);
  const property = {
    id,
    landlordId: LANDLORD_ID,
    title: 'Existing Property',
    description: 'A property seeded for PUT multipart tests.',
    price: 3000,
    address: 'Av. Brigadeiro Faria Lima, 2000, São Paulo - SP',
    status: 'AVAILABLE',
    images: [],
    currentTenant: null,
    ...overrides,
  };
  return property;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  // Service is mocked so no real disk writes happen, but clean up any stray
  // uploads/<propertyId>/ directories just in case.
  const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
  for (const id of createdPropertyIds) {
    await fs.rm(path.join(UPLOADS_ROOT, id), { recursive: true, force: true }).catch(() => {});
  }
  createdPropertyIds.clear();
});

describe('PUT /api/properties/:id — multipart + owner-only (US-006)', () => {
  it('returns 200 and calls updateProperty with 2 files when owner uploads 2 photos via multipart', async () => {
    const property = seedProperty({ images: [] });
    mockGetPropertyById.mockResolvedValue(property);
    mockUpdateProperty.mockImplementation(async (id: string, data: any, files?: any[]) => {
      const newImages = (files ?? []).map((_, i) => ({
        id: randomUUID(),
        propertyId: id,
        url: `/uploads/${id}/${randomUUID()}.jpg`,
        isCover: i === 0, // first photo cover since property had none
        caption: null,
        createdAt: new Date().toISOString(),
      }));
      return { ...property, ...data, images: newImages };
    });

    const res = await request(app)
      .put(`/api/properties/${property.id}`)
      .set('Authorization', 'Bearer landlord-owner')
      .field('title', 'Updated Title')
      .attach('photos', TINY_JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
      .attach('photos', TINY_JPEG, { filename: 'b.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
    expect(res.body.images).toHaveLength(2);
    expect(mockUpdateProperty).toHaveBeenCalledTimes(1);
    const [, , filesArg] = mockUpdateProperty.mock.calls[0];
    expect(Array.isArray(filesArg)).toBe(true);
    expect(filesArg).toHaveLength(2);
  });

  it('returns 200 and passes files=undefined/empty when owner PUTs JSON-only body (regression guard)', async () => {
    const property = seedProperty({
      images: [
        {
          id: randomUUID(),
          propertyId: 'seeded',
          url: '/uploads/seeded/existing.jpg',
          isCover: true,
          caption: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    mockGetPropertyById.mockResolvedValue(property);
    mockUpdateProperty.mockImplementation(async (id: string, data: any, files?: any[]) => {
      // Simulate Prisma semantics: scalar updates merge, existing images untouched.
      return { ...property, ...data, id, images: property.images };
    });

    const res = await request(app)
      .put(`/api/properties/${property.id}`)
      .set('Authorization', 'Bearer landlord-owner')
      .set('Content-Type', 'application/json')
      .send({ title: 'Title Via JSON', status: 'NEGOTIATING' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Title Via JSON');
    expect(res.body.status).toBe('NEGOTIATING');
    expect(res.body.images).toHaveLength(1);
    expect(res.body.images[0].isCover).toBe(true);
    const filesArg = mockUpdateProperty.mock.calls[0][2];
    expect(filesArg === undefined || (Array.isArray(filesArg) && filesArg.length === 0)).toBe(true);
  });

  it('returns 403 FORBIDDEN when a different landlord tries multipart PUT on someone else\'s property', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .put(`/api/properties/${property.id}`)
      .set('Authorization', 'Bearer landlord-intruder')
      .field('title', 'Hacker Title')
      .attach('photos', TINY_JPEG, { filename: 'x.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('code', 'FORBIDDEN');
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it('returns 401 UNAUTHORIZED when no Authorization header is sent', async () => {
    const res = await request(app)
      .put(`/api/properties/${randomUUID()}`)
      .send({ title: 'anonymous' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(mockGetPropertyById).not.toHaveBeenCalled();
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it('returns 404 when the property does not exist', async () => {
    mockGetPropertyById.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/properties/${randomUUID()}`)
      .set('Authorization', 'Bearer landlord-owner')
      .send({ title: 'ghost' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });

  it('returns 400 INVALID_FILE_TYPE when a non-image file is attached via multipart', async () => {
    const property = seedProperty();
    mockGetPropertyById.mockResolvedValue(property);

    const res = await request(app)
      .put(`/api/properties/${property.id}`)
      .set('Authorization', 'Bearer landlord-owner')
      .attach('photos', Buffer.from('not an image'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'INVALID_FILE_TYPE');
    expect(mockUpdateProperty).not.toHaveBeenCalled();
  });
});
