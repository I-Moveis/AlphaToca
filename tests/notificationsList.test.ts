import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firebase env vars must be present before importing app — validateAuthConfig
// runs at load time and importing src/app transitively pulls in firebase init.
process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || 'test@example.com';
process.env.FIREBASE_PRIVATE_KEY = process.env.FIREBASE_PRIVATE_KEY || 'test-key';

const USER_A_ID = '22222222-2222-2222-2222-222222222222';
const USER_B_ID = '55555555-5555-5555-5555-555555555555';

const { mockListForUser } = vi.hoisted(() => ({
  mockListForUser: vi.fn(),
}));

// `importOriginal` auth mock (keeps requireRole real, stubs checkJwt/authSyncMiddleware).
vi.mock('../src/middlewares/authMiddleware', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    validateAuthConfig: () => {},
    checkJwt: (req: any, res: any, next: any) => {
      const header = req.headers.authorization;
      if (header === 'Bearer the-user-a' || header === 'Bearer the-user-b') {
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
      const uid = req.auth?.payload?.uid;
      let localUser = {
        id: USER_A_ID,
        firebaseUid: uid,
        name: 'User A',
        email: 'a@demo.com',
        phoneNumber: '+5511999999000',
        role: 'TENANT',
        fcmToken: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      if (uid === 'Bearer the-user-b') {
        localUser = { ...localUser, id: USER_B_ID, name: 'User B' };
      }
      req.localUser = localUser;
      next();
    },
  };
});

vi.mock('../src/services/notificationService', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    notificationService: {
      ...actual.notificationService,
      listForUser: mockListForUser,
    },
  };
});

import request from 'supertest';
import app from '../src/app';

function seedNotificationView(overrides: Partial<any> = {}) {
  return {
    id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn1',
    title: 'Nova funcionalidade disponível!',
    body: 'Confira os novos imóveis disponíveis na sua região.',
    receivedAt: '2026-05-07T12:00:00.000Z',
    read: false,
    category: 'announcement',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/notifications — US-013', () => {
  it('returns 200 with the user notifications ordered by receivedAt DESC', async () => {
    const items = [
      seedNotificationView({
        id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn1',
        receivedAt: '2026-05-07T12:00:00.000Z',
      }),
      seedNotificationView({
        id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn2',
        receivedAt: '2026-05-06T12:00:00.000Z',
        title: 'Manutenção programada',
        body: 'O app ficará indisponível entre 2h e 4h.',
        category: 'system',
      }),
    ];
    mockListForUser.mockResolvedValue(items);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(items);
    expect(mockListForUser).toHaveBeenCalledTimes(1);
    expect(mockListForUser).toHaveBeenCalledWith(USER_A_ID, { unreadOnly: false });
  });

  it('returns an empty array when the user has no notifications', async () => {
    mockListForUser.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer the-user-b');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(mockListForUser).toHaveBeenCalledWith(USER_B_ID, { unreadOnly: false });
  });

  it('forwards unreadOnly=true to the service', async () => {
    mockListForUser.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/notifications?unreadOnly=true')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(200);
    expect(mockListForUser).toHaveBeenCalledWith(USER_A_ID, { unreadOnly: true });
  });

  it('forwards unreadOnly=false explicitly as false', async () => {
    mockListForUser.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/notifications?unreadOnly=false')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(200);
    expect(mockListForUser).toHaveBeenCalledWith(USER_A_ID, { unreadOnly: false });
  });

  it('returns 400 when unreadOnly has an invalid value', async () => {
    const res = await request(app)
      .get('/api/notifications?unreadOnly=yes')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
    expect(mockListForUser).not.toHaveBeenCalled();
  });

  it('item shape has the 6 required fields and does not leak internal fields', async () => {
    mockListForUser.mockResolvedValue([seedNotificationView()]);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(200);
    const item = res.body[0];
    expect(item).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      body: expect.any(String),
      receivedAt: expect.any(String),
      read: expect.any(Boolean),
      category: expect.stringMatching(/^(update|announcement|system)$/),
    });
    // FCM-dispatch internals should NOT leak to the user-facing list.
    expect(item).not.toHaveProperty('type');
    expect(item).not.toHaveProperty('data');
    expect(item).not.toHaveProperty('userId');
    expect(item).not.toHaveProperty('readAt');
    expect(item).not.toHaveProperty('sentAt');
  });

  it('user A sees only their own notifications — scoped by req.localUser.id', async () => {
    const userAItems = [
      seedNotificationView({ id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn1' }),
    ];
    mockListForUser.mockResolvedValue(userAItems);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer the-user-a');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(userAItems);
    // The service is called with the caller's id, never anyone else's.
    expect(mockListForUser).toHaveBeenCalledWith(USER_A_ID, { unreadOnly: false });
    expect(mockListForUser).not.toHaveBeenCalledWith(USER_B_ID, expect.anything());
  });

  it('user B sees only their own notifications — cross-user isolation', async () => {
    const userBItems = [
      seedNotificationView({
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
        title: "User B's notification",
      }),
    ];
    mockListForUser.mockResolvedValue(userBItems);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer the-user-b');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(userBItems);
    expect(mockListForUser).toHaveBeenCalledWith(USER_B_ID, { unreadOnly: false });
    expect(mockListForUser).not.toHaveBeenCalledWith(USER_A_ID, expect.anything());
  });

  it('returns 401 UNAUTHORIZED when the Authorization header is missing', async () => {
    const res = await request(app).get('/api/notifications');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(mockListForUser).not.toHaveBeenCalled();
  });
});
