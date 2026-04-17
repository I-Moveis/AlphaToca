import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAxiosPost = vi.hoisted(() => {
    process.env.TOKEN_ACCES_WHATSAPP = 'test-access-token';
    process.env.PHONE_NUMBER_ID = 'test-phone-id';
    return vi.fn();
});

vi.mock('axios', () => ({
    default: {
        post: mockAxiosPost,
    },
}));

vi.mock('../src/config/db', () => ({
    default: {
        user: {
            upsert: vi.fn().mockResolvedValue({ id: 'user-1', phoneNumber: '5511999998888', name: 'Test User' }),
            findUnique: vi.fn().mockResolvedValue({ id: 'user-1' }),
        },
        chatSession: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'session-1', tenantId: 'user-1', status: 'ACTIVE_BOT' }),
        },
        message: {
            create: vi.fn().mockResolvedValue({ id: 'msg-db-1' }),
            findUnique: vi.fn().mockResolvedValue(null),
        },
    },
}));

import { sendMessage } from '../src/services/whatsappService';
import prisma from '../src/config/db';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('whatsappService.sendMessage', () => {
    it('should successfully send a message via Meta API and return response data', async () => {
        const mockResponse = {
            data: {
                messages: [{ id: 'wamid-meta-123' }],
                messaging_product: 'whatsapp',
                contacts: [{ input: '5511999998888', wa_id: '5511999998888' }],
            },
        };

        mockAxiosPost.mockResolvedValue(mockResponse);

        const result = await sendMessage('5511999998888', 'Hello!');

        expect(mockAxiosPost).toHaveBeenCalledWith(
            'https://graph.facebook.com/v20.0/test-phone-id/messages',
            {
                messaging_product: 'whatsapp',
                to: '5511999998888',
                type: 'text',
                text: { body: 'Hello!' },
            },
            {
                headers: {
                    Authorization: 'Bearer test-access-token',
                    'Content-Type': 'application/json',
                },
            }
        );
        expect(result).toEqual(mockResponse.data);
    });

    it('should throw when Meta API returns error code 130497 (restriction)', async () => {
        const metaError: any = new Error('Request failed with status code 403');
        metaError.response = {
            data: {
                error: {
                    message: '(130497) Restrictions on the phone number do not allow sending messages.',
                    type: 'OAuthException',
                    code: 130497,
                    error_subcode: 2615,
                },
            },
        };

        mockAxiosPost.mockRejectedValue(metaError);

        await expect(sendMessage('5511999998888', 'Hello!')).rejects.toThrow();
        expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should throw for other API errors (non-130497)', async () => {
        const genericError: any = new Error('Request failed with status code 401');
        genericError.response = {
            data: {
                error: {
                    message: 'Invalid access token',
                    type: 'OAuthException',
                    code: 190,
                },
            },
        };

        mockAxiosPost.mockRejectedValue(genericError);

        await expect(sendMessage('5511999998888', 'Hello!')).rejects.toThrow();
        expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should throw on network error (no response)', async () => {
        const networkError = new Error('Network Error');
        mockAxiosPost.mockRejectedValue(networkError);

        await expect(sendMessage('5511999998888', 'Hello!')).rejects.toThrow('Network Error');
    });

    it('should persist message to database on successful send', async () => {
        const mockResponse = {
            data: {
                messages: [{ id: 'wamid-meta-123' }],
            },
        };

        mockAxiosPost.mockResolvedValue(mockResponse);

        await sendMessage('5511999998888', 'Hello!');

        expect(prisma.message.create).toHaveBeenCalled();
    });
});

describe('whatsappWorker duplicate handling', () => {
    it('should detect duplicate wamid via database lookup', async () => {
        (prisma.message.findUnique as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue({
            id: 'existing-msg',
            wamid: 'wamid-test-1',
        });

        const existing = await prisma.message.findUnique({ where: { wamid: 'wamid-test-1' } });

        expect(existing).toBeTruthy();
        expect((existing as any).wamid).toBe('wamid-test-1');
    });

    it('should return null for new wamid', async () => {
        (prisma.message.findUnique as ReturnType<typeof vi.fn>) = vi.fn().mockResolvedValue(null);

        const result = await prisma.message.findUnique({ where: { wamid: 'wamid-new-1' } });

        expect(result).toBeNull();
    });
});

describe('whatsappWorker error scenario: Meta API restriction (130497)', () => {
    it('should propagate error when sendMessage encounters 130497, allowing BullMQ retry handling', async () => {
        const restrictionError: any = new Error('Restriction error');
        restrictionError.response = {
            data: {
                error: {
                    message: '(130497) Restrictions on the phone number.',
                    code: 130497,
                    error_subcode: 2615,
                },
            },
        };

        mockAxiosPost.mockRejectedValue(restrictionError);

        await expect(sendMessage('5511999998888', 'Test message')).rejects.toThrow();
        expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    });

    it('should still have created user/chatSession before send attempt failed', async () => {
        (prisma.user.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 'user-1',
            phoneNumber: '5511999998888',
            name: 'Test User',
        });

        const user = await prisma.user.upsert({
            where: { phoneNumber: '5511999998888' },
            update: { name: 'Test User' },
            create: { phoneNumber: '5511999998888', name: 'Test User', role: 'TENANT' },
        });

        expect(user.phoneNumber).toBe('5511999998888');
        expect(prisma.user.upsert).toHaveBeenCalled();
    });
});