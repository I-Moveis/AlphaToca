import { describe, it, expect, vi, beforeEach } from 'vitest';

// US-006 service-level test: the createMessage method must run the INSERT and
// the Conversation.lastMessageAt UPDATE inside a single $transaction so the
// inbox ordering never observes a persisted message with an outdated
// lastMessageAt. The mock proxies tx.conversationMessage and tx.conversation
// to the same jest-style mocks the assertions read, mirroring the pattern
// used in tests/propertyPhotosRemove.test.ts.
vi.mock('../src/config/db', () => {
  const conversationMessage = {
    create: vi.fn(),
  };
  const conversation = {
    update: vi.fn(),
  };
  const $transaction = vi.fn(async (fn: (tx: any) => Promise<any>) =>
    fn({ conversationMessage, conversation }),
  );
  return {
    default: { conversationMessage, conversation, $transaction },
  };
});

import prisma from '../src/config/db';
import { conversationService } from '../src/services/conversationService';

const mockMessageCreate = prisma.conversationMessage.create as unknown as ReturnType<
  typeof vi.fn
>;
const mockConversationUpdate = prisma.conversation.update as unknown as ReturnType<
  typeof vi.fn
>;
const mockTransaction = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;

const CONV_ID = '11111111-1111-1111-1111-111111111111';
const AUTHOR_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('conversationService.createMessage — US-006', () => {
  it('persists the message and updates Conversation.lastMessageAt in the same transaction', async () => {
    const createdAt = new Date('2026-05-08T10:00:00.000Z');
    mockMessageCreate.mockResolvedValue({
      id: 'msg-1',
      authorId: AUTHOR_ID,
      content: 'Hello',
      createdAt,
      readAt: null,
    });
    mockConversationUpdate.mockResolvedValue({ id: CONV_ID, lastMessageAt: createdAt });

    const result = await conversationService.createMessage(CONV_ID, AUTHOR_ID, 'Hello');

    expect(result).toEqual({
      id: 'msg-1',
      authorId: AUTHOR_ID,
      content: 'Hello',
      createdAt: createdAt.toISOString(),
      readAt: null,
    });

    // Both side-effects ran exactly once, inside a single $transaction callback.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    expect(mockConversationUpdate).toHaveBeenCalledTimes(1);
  });

  it('passes message.createdAt (not a fresh Date) to Conversation.update for byte-identical timestamps', async () => {
    const createdAt = new Date('2026-05-08T12:34:56.789Z');
    mockMessageCreate.mockResolvedValue({
      id: 'msg-2',
      authorId: AUTHOR_ID,
      content: 'x',
      createdAt,
      readAt: null,
    });
    mockConversationUpdate.mockResolvedValue({});

    await conversationService.createMessage(CONV_ID, AUTHOR_ID, 'x');

    const updateArgs = mockConversationUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: CONV_ID });
    // Must be the SAME Date instance returned by create, not a new one — keeps
    // lastMessageAt and message.createdAt identical down to the millisecond.
    expect(updateArgs.data.lastMessageAt).toBe(createdAt);
  });

  it('forwards conversationId + authorId + content into the INSERT with the 5-field select', async () => {
    mockMessageCreate.mockResolvedValue({
      id: 'msg-3',
      authorId: AUTHOR_ID,
      content: 'hi',
      createdAt: new Date('2026-05-08T09:00:00.000Z'),
      readAt: null,
    });
    mockConversationUpdate.mockResolvedValue({});

    await conversationService.createMessage(CONV_ID, AUTHOR_ID, 'hi');

    const createArgs = mockMessageCreate.mock.calls[0][0];
    expect(createArgs.data).toEqual({
      conversationId: CONV_ID,
      authorId: AUTHOR_ID,
      content: 'hi',
    });
    expect(createArgs.select).toEqual({
      id: true,
      authorId: true,
      content: true,
      createdAt: true,
      readAt: true,
    });
  });

  it('does NOT update the conversation if the message insert throws (transaction rolls back both)', async () => {
    const boom = new Error('INSERT failed: FK violation');
    mockMessageCreate.mockRejectedValue(boom);

    await expect(
      conversationService.createMessage(CONV_ID, AUTHOR_ID, 'rollback-me'),
    ).rejects.toThrow(boom);

    expect(mockMessageCreate).toHaveBeenCalledTimes(1);
    // The callback aborted before reaching `conversation.update` — no lastMessageAt write.
    expect(mockConversationUpdate).not.toHaveBeenCalled();
  });

  it('readAt in the returned view is null when create returns readAt: null', async () => {
    mockMessageCreate.mockResolvedValue({
      id: 'msg-4',
      authorId: AUTHOR_ID,
      content: 'new',
      createdAt: new Date('2026-05-08T00:00:00.000Z'),
      readAt: null,
    });
    mockConversationUpdate.mockResolvedValue({});

    const res = await conversationService.createMessage(CONV_ID, AUTHOR_ID, 'new');

    expect(res.readAt).toBeNull();
  });
});
