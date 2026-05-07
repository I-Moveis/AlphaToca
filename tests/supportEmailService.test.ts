import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SupportTicket } from '@prisma/client';

import {
  supportEmailService,
  type SupportEmailTransport,
} from '../src/services/supportEmailService';

const TICKET: SupportTicket = {
  id: '11111111-1111-1111-1111-111111111111',
  code: 'SUP-260507-A3F2',
  title: 'App trava ao enviar foto',
  description: 'Quando tento enviar uma foto no chat, o app fecha sozinho.',
  userId: '22222222-2222-2222-2222-222222222222',
  userName: 'Maria Silva',
  userRole: 'TENANT',
  status: 'OPEN',
  resolution: null,
  assignedToId: null,
  createdAt: new Date('2026-05-07T12:00:00Z'),
  updatedAt: new Date('2026-05-07T12:00:00Z'),
};

const ORIGINAL_ENABLED = process.env.SUPPORT_EMAIL_ENABLED;
const ORIGINAL_TO = process.env.SUPPORT_EMAIL_TO;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) delete process.env.SUPPORT_EMAIL_ENABLED;
  else process.env.SUPPORT_EMAIL_ENABLED = ORIGINAL_ENABLED;

  if (ORIGINAL_TO === undefined) delete process.env.SUPPORT_EMAIL_TO;
  else process.env.SUPPORT_EMAIL_TO = ORIGINAL_TO;
});

describe('supportEmailService.sendTicketCreated()', () => {
  it('does NOT call the transport when SUPPORT_EMAIL_ENABLED is unset', async () => {
    delete process.env.SUPPORT_EMAIL_ENABLED;
    const transport: SupportEmailTransport = { send: vi.fn() };

    await supportEmailService.sendTicketCreated(TICKET, transport);

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('does NOT call the transport when SUPPORT_EMAIL_ENABLED=false', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'false';
    const transport: SupportEmailTransport = { send: vi.fn() };

    await supportEmailService.sendTicketCreated(TICKET, transport);

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('calls the transport exactly once when SUPPORT_EMAIL_ENABLED=true', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';
    const transport: SupportEmailTransport = { send: vi.fn().mockResolvedValue(undefined) };

    await supportEmailService.sendTicketCreated(TICKET, transport);

    expect(transport.send).toHaveBeenCalledTimes(1);
    const envelope = (transport.send as any).mock.calls[0][0];
    expect(envelope).toMatchObject({
      ticketId: TICKET.id,
      ticketCode: TICKET.code,
    });
    expect(envelope.subject).toContain(TICKET.code);
    expect(envelope.body).toContain(TICKET.userName);
    expect(envelope.body).toContain(TICKET.description);
  });

  it('does not throw when transport.send rejects (failure is logged, not fatal)', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';
    const transport: SupportEmailTransport = {
      send: vi.fn().mockRejectedValue(new Error('smtp down')),
    };

    await expect(
      supportEmailService.sendTicketCreated(TICKET, transport),
    ).resolves.toBeUndefined();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('does NOT throw when enabled but no transport is injected (TODO path)', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';

    await expect(supportEmailService.sendTicketCreated(TICKET)).resolves.toBeUndefined();
  });

  it('uses SUPPORT_EMAIL_TO env override when provided', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';
    process.env.SUPPORT_EMAIL_TO = 'ops@example.com';
    const transport: SupportEmailTransport = { send: vi.fn().mockResolvedValue(undefined) };

    await supportEmailService.sendTicketCreated(TICKET, transport);

    const envelope = (transport.send as any).mock.calls[0][0];
    expect(envelope.to).toBe('ops@example.com');
  });
});

describe('supportEmailService.sendTicketUpdated()', () => {
  it('does NOT call the transport when disabled', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'false';
    const transport: SupportEmailTransport = { send: vi.fn() };

    await supportEmailService.sendTicketUpdated(
      { ...TICKET, status: 'RESOLVED', resolution: 'Atualize o app.' },
      transport,
    );

    expect(transport.send).not.toHaveBeenCalled();
  });

  it('calls the transport once with the current status/resolution when enabled', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';
    const transport: SupportEmailTransport = { send: vi.fn().mockResolvedValue(undefined) };
    const resolved: SupportTicket = {
      ...TICKET,
      status: 'RESOLVED',
      resolution: 'Atualize o app para a versão 2.1.0.',
    };

    await supportEmailService.sendTicketUpdated(resolved, transport);

    expect(transport.send).toHaveBeenCalledTimes(1);
    const envelope = (transport.send as any).mock.calls[0][0];
    expect(envelope.ticketCode).toBe(resolved.code);
    expect(envelope.subject).toContain('RESOLVED');
    expect(envelope.body).toContain('Atualize o app');
  });

  it('does not throw when transport.send rejects', async () => {
    process.env.SUPPORT_EMAIL_ENABLED = 'true';
    const transport: SupportEmailTransport = {
      send: vi.fn().mockRejectedValue(new Error('network')),
    };

    await expect(
      supportEmailService.sendTicketUpdated(TICKET, transport),
    ).resolves.toBeUndefined();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
});
