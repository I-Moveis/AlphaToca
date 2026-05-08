import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUserFindMany, mockCreateMany, mockTransaction, mockBroadcastToAll } = vi.hoisted(() => ({
  mockUserFindMany: vi.fn(),
  mockCreateMany: vi.fn(),
  mockTransaction: vi.fn(async (fn: any) => fn({ notification: { createMany: mockCreateMany } })),
  mockBroadcastToAll: vi.fn(),
}));

vi.mock('../src/config/db', () => ({
  default: {
    user: { findMany: mockUserFindMany },
    $transaction: mockTransaction,
  },
}));

vi.mock('../src/services/pushNotificationService', () => ({
  pushNotificationService: {
    broadcastToAll: mockBroadcastToAll,
  },
}));

import { broadcastService } from '../src/services/broadcastService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('broadcastService.sendToAll — US-013 persistence', () => {
  it('persists one Notification row per user and then dispatches FCM', async () => {
    mockUserFindMany.mockResolvedValue([
      { id: 'user-1', fcmToken: 'token-1' },
      { id: 'user-2', fcmToken: null },
      { id: 'user-3', fcmToken: 'token-3' },
    ]);
    mockCreateMany.mockResolvedValue({ count: 3 });
    mockBroadcastToAll.mockResolvedValue({ sent: 2, failed: 0 });

    const result = await broadcastService.sendToAll({
      title: 'Novo lançamento',
      body: 'Confira os imóveis em destaque.',
    });

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          type: 'BROADCAST',
          category: 'announcement',
          title: 'Novo lançamento',
          body: 'Confira os imóveis em destaque.',
        },
        {
          userId: 'user-2',
          type: 'BROADCAST',
          category: 'announcement',
          title: 'Novo lançamento',
          body: 'Confira os imóveis em destaque.',
        },
        {
          userId: 'user-3',
          type: 'BROADCAST',
          category: 'announcement',
          title: 'Novo lançamento',
          body: 'Confira os imóveis em destaque.',
        },
      ],
    });
    expect(mockBroadcastToAll).toHaveBeenCalledWith(
      'Novo lançamento',
      'Confira os imóveis em destaque.',
      { type: 'BROADCAST' },
    );
    expect(result).toEqual({ sent: 2, failed: 0, persisted: 3 });
  });

  it('skips persistence and still returns {persisted:0} when there are no users', async () => {
    mockUserFindMany.mockResolvedValue([]);
    mockBroadcastToAll.mockResolvedValue({ sent: 0, failed: 0 });

    const result = await broadcastService.sendToAll({ title: 'x', body: 'y' });

    expect(mockTransaction).not.toHaveBeenCalled();
    expect(mockCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, failed: 0, persisted: 0 });
  });

  it('persists for users without an fcmToken (cross-device history is not FCM-dependent)', async () => {
    // Only users without a token — FCM dispatch will not reach anyone, but the
    // history rows must still be created so the user sees the broadcast when
    // they open the app later.
    mockUserFindMany.mockResolvedValue([
      { id: 'user-10', fcmToken: null },
      { id: 'user-11', fcmToken: null },
    ]);
    mockCreateMany.mockResolvedValue({ count: 2 });
    mockBroadcastToAll.mockResolvedValue({ sent: 0, failed: 0 });

    const result = await broadcastService.sendToAll({ title: 'a', body: 'b' });

    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-10', type: 'BROADCAST', category: 'announcement', title: 'a', body: 'b' },
        { userId: 'user-11', type: 'BROADCAST', category: 'announcement', title: 'a', body: 'b' },
      ],
    });
    expect(result).toEqual({ sent: 0, failed: 0, persisted: 2 });
  });

  it('if persistence throws, FCM is NOT dispatched — history is the source of truth', async () => {
    mockUserFindMany.mockResolvedValue([{ id: 'user-1', fcmToken: 'token-1' }]);
    mockCreateMany.mockRejectedValue(new Error('DB down'));

    await expect(
      broadcastService.sendToAll({ title: 'x', body: 'y' }),
    ).rejects.toThrow('DB down');

    expect(mockBroadcastToAll).not.toHaveBeenCalled();
  });
});
