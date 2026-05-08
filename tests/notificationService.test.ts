import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}));

vi.mock('../src/config/db', () => ({
  default: {
    notification: {
      findMany: mockFindMany,
    },
  },
}));

import { notificationService } from '../src/services/notificationService';

const USER_A_ID = '22222222-2222-2222-2222-222222222222';

function seedRow(overrides: Partial<any> = {}) {
  return {
    id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn1',
    title: 'Nova funcionalidade',
    body: 'Corpo da notificação',
    receivedAt: new Date('2026-05-07T12:00:00.000Z'),
    readAt: null,
    category: 'announcement',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notificationService.listForUser — US-013', () => {
  it('queries scoped by userId, orderBy receivedAt DESC, with the narrow select', async () => {
    mockFindMany.mockResolvedValue([]);

    await notificationService.listForUser(USER_A_ID);

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: USER_A_ID },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        title: true,
        body: true,
        receivedAt: true,
        readAt: true,
        category: true,
      },
    });
  });

  it('adds readAt: null to the where clause when unreadOnly=true', async () => {
    mockFindMany.mockResolvedValue([]);

    await notificationService.listForUser(USER_A_ID, { unreadOnly: true });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A_ID, readAt: null },
      }),
    );
  });

  it('omits readAt from the where clause when unreadOnly=false (default)', async () => {
    mockFindMany.mockResolvedValue([]);

    await notificationService.listForUser(USER_A_ID, { unreadOnly: false });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_A_ID },
      }),
    );
    // Specifically: no `readAt` key was set on the where clause.
    const call = mockFindMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('readAt');
  });

  it('maps readAt=null to read:false and ISO-serializes receivedAt', async () => {
    mockFindMany.mockResolvedValue([
      seedRow({ readAt: null, receivedAt: new Date('2026-05-07T12:00:00.000Z') }),
    ]);

    const result = await notificationService.listForUser(USER_A_ID);

    expect(result).toEqual([
      {
        id: 'nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnn1',
        title: 'Nova funcionalidade',
        body: 'Corpo da notificação',
        receivedAt: '2026-05-07T12:00:00.000Z',
        read: false,
        category: 'announcement',
      },
    ]);
  });

  it('maps readAt=<Date> to read:true', async () => {
    mockFindMany.mockResolvedValue([seedRow({ readAt: new Date('2026-05-07T13:00:00.000Z') })]);

    const result = await notificationService.listForUser(USER_A_ID);

    expect(result[0]!.read).toBe(true);
  });

  it('preserves DB order — service does not re-sort after findMany', async () => {
    const newer = seedRow({ id: 'n1', receivedAt: new Date('2026-05-07T12:00:00.000Z') });
    const older = seedRow({ id: 'n2', receivedAt: new Date('2026-05-06T12:00:00.000Z') });
    // DB returns newer-first (via orderBy: desc); we just project.
    mockFindMany.mockResolvedValue([newer, older]);

    const result = await notificationService.listForUser(USER_A_ID);

    expect(result.map((r) => r.id)).toEqual(['n1', 'n2']);
  });
});
