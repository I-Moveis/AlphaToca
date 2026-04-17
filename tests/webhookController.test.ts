import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WhatsAppWebhookSchema } from '../src/schemas/whatsappSchema';

const { mockQueueAdd, mockUpdateMessageStatus } = vi.hoisted(() => ({
    mockQueueAdd: vi.fn().mockResolvedValue({ id: 'job-1' }),
    mockUpdateMessageStatus: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/queues/whatsappQueue', () => ({
    messageQueue: {
        add: mockQueueAdd,
    },
}));

vi.mock('../src/services/messageStatusService', () => ({
    updateMessageStatus: mockUpdateMessageStatus,
}));

import { verifyWebhook, receiveMessage } from '../src/controllers/webhookController';
import { Request, Response, NextFunction } from 'express';

function mockRes(): Response {
    return {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        sendStatus: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;
}

const mockNext: NextFunction = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
});

describe('verifyWebhook', () => {
    it('should return 200 with challenge when verify token matches', () => {
        process.env.WHATSAPP_VERIFY_TOKEN = 'test-token-123';
        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'test-token-123',
                'hub.challenge': 'challenge-code',
            },
        } as unknown as Request;
        const res = mockRes();

        verifyWebhook(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('challenge-code');
    });

    it('should return 403 when verify token does not match', () => {
        process.env.WHATSAPP_VERIFY_TOKEN = 'test-token-123';
        const req = {
            query: {
                'hub.mode': 'subscribe',
                'hub.verify_token': 'wrong-token',
                'hub.challenge': 'challenge-code',
            },
        } as unknown as Request;
        const res = mockRes();

        verifyWebhook(req, res);

        expect(res.sendStatus).toHaveBeenCalledWith(403);
    });
});

describe('receiveMessage', () => {
    const validPayload = {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: 'entry-id-1',
                changes: [
                    {
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: {
                                display_phone_number: '1234567890',
                                phone_number_id: 'phone-id-1',
                            },
                            contacts: [
                                {
                                    wa_id: '5511999998888',
                                    profile: { name: 'Test User' },
                                },
                            ],
                            messages: [
                                {
                                    from: '5511999998888',
                                    id: 'wamid-test-1',
                                    timestamp: '1700000000',
                                    type: 'text' as const,
                                    text: { body: 'Hello!' },
                                },
                            ],
                        },
                    },
                ],
            },
        ],
    };

    it('should return 200 and enqueue valid payload to BullMQ', async () => {
        const req = { body: validPayload } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
        expect(mockQueueAdd).toHaveBeenCalledWith('whatsapp-message', validPayload, {
            attempts: 1,
            removeOnComplete: true,
            removeOnFail: 100,
        });
    });

    it('should return 200 and NOT enqueue when object is not whatsapp_business_account', async () => {
        const req = {
            body: { ...validPayload, object: 'something_else' },
        } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should return 200 even when payload fails Zod validation (invalid structure)', async () => {
        const req = {
            body: { object: 'whatsapp_business_account', invalidKey: true },
        } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('EVENT_RECEIVED');
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should return 200 even when payload is completely empty', async () => {
        const req = { body: {} } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should return 200 even when entry has wrong type', async () => {
        const req = {
            body: { object: 'whatsapp_business_account', entry: 'not_an_array' },
        } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });

    it('should handle status updates and return 200 without enqueueing', async () => {
        const statusPayload = {
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: 'entry-id-1',
                    changes: [
                        {
                            value: {
                                statuses: [
                                    { id: 'msg-status-1', status: 'delivered' },
                                ],
                            },
                        },
                    ],
                },
            ],
        };
        const req = { body: statusPayload } as Request;
        const res = mockRes();

        await receiveMessage(req, res, mockNext);

        expect(res.sendStatus).toHaveBeenCalledWith(200);
        expect(mockQueueAdd).not.toHaveBeenCalled();
    });
});

describe('WhatsAppWebhookSchema (Zod)', () => {
    it('should validate a correct full payload', () => {
        const result = WhatsAppWebhookSchema.parse({
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: 'entry-id',
                    changes: [
                        {
                            value: {
                                messaging_product: 'whatsapp',
                                contacts: [
                                    { wa_id: '5511999998888', profile: { name: 'User' } },
                                ],
                                messages: [
                                    {
                                        from: '5511999998888',
                                        id: 'msg-id',
                                        timestamp: '1700000000',
                                        type: 'text',
                                        text: { body: 'Hello' },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(result.object).toBe('whatsapp_business_account');
        expect(result.entry).toHaveLength(1);
    });

    it('should reject payload missing entry', () => {
        const result = WhatsAppWebhookSchema.safeParse({
            object: 'whatsapp_business_account',
        });

        expect(result.success).toBe(false);
    });

    it('should reject payload with empty entry array', () => {
        const result = WhatsAppWebhookSchema.safeParse({
            object: 'whatsapp_business_account',
            entry: [],
        });

        expect(result.success).toBe(false);
    });

    it('should reject payload with non-string object', () => {
        const result = WhatsAppWebhookSchema.safeParse({
            object: 123,
            entry: [{ id: 'a', changes: [] }],
        });

        expect(result.success).toBe(false);
    });

    it('should reject message with wrong type field', () => {
        const result = WhatsAppWebhookSchema.safeParse({
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: 'entry-id',
                    changes: [
                        {
                            value: {
                                messages: [
                                    {
                                        from: '5511999998888',
                                        id: 'msg-id',
                                        timestamp: '1700000000',
                                        type: 'image',
                                        text: { body: 'Hello' },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(result.success).toBe(false);
    });

    it('should accept payload with optional fields missing', () => {
        const result = WhatsAppWebhookSchema.safeParse({
            object: 'whatsapp_business_account',
            entry: [
                {
                    id: 'entry-id',
                    changes: [
                        {
                            value: {
                                contacts: [
                                    { wa_id: '5511999998888' },
                                ],
                                messages: [
                                    {
                                        from: '5511999998888',
                                        id: 'msg-id',
                                        timestamp: '1700000000',
                                        type: 'text',
                                        text: { body: 'Hello' },
                                    },
                                ],
                            },
                        },
                    ],
                },
            ],
        });

        expect(result.success).toBe(true);
    });
});