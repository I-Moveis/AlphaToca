import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupportUserRole } from '@prisma/client';

// Mock de `../src/config/db` deve vir antes de importar o serviço, caso
// contrário o módulo real do Prisma é puxado e tenta conectar no banco.
vi.mock('../src/config/db', () => ({
  default: {
    supportTicket: {
      create: vi.fn(),
    },
  },
}));

import prisma from '../src/config/db';
import {
  supportTicketService,
  generateTicketCode,
  SupportTicketError,
} from '../src/services/supportTicketService';

const author = {
  id: '22222222-2222-2222-2222-222222222222',
  name: 'Maria Silva',
  role: SupportUserRole.TENANT,
};

const payload = {
  title: 'App trava ao enviar foto',
  description: 'O app fecha quando seleciono uma foto da galeria no chat.',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('generateTicketCode()', () => {
  it('returns a code in the format SUP-AAMMDD-XXXX', () => {
    const code = generateTicketCode(new Date('2026-05-07T12:00:00'));
    expect(code).toMatch(/^SUP-\d{6}-[A-Z0-9]{4}$/);
  });

  it('uses the local date (YY MM DD) not UTC', () => {
    // Usar uma data simples — o teste valida que AAMMDD existe e tem 6 dígitos
    // sem depender do TZ do host de CI.
    const code = generateTicketCode(new Date(2026, 4, 7, 12, 0, 0)); // mês é 0-indexed
    expect(code.startsWith('SUP-260507-')).toBe(true);
  });

  it('includes a 4-char base36 uppercase suffix', () => {
    const suffixes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const code = generateTicketCode(new Date('2026-05-07T12:00:00'));
      const suffix = code.split('-').pop()!;
      expect(suffix).toMatch(/^[A-Z0-9]{4}$/);
      suffixes.add(suffix);
    }
    // 20 amostras sobre ~1.7M possíveis — probabilidade de colisão completa
    // é ~0. Se cair, algo está errado no gerador.
    expect(suffixes.size).toBeGreaterThan(1);
  });
});

describe('supportTicketService.create()', () => {
  it('inserts a ticket with server-derived fields and returns the row', async () => {
    const createdAt = new Date('2026-05-07T12:00:00Z');
    const inserted = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      code: 'SUP-260507-A3F2',
      title: payload.title,
      description: payload.description,
      userId: author.id,
      userName: author.name,
      userRole: author.role,
      status: 'OPEN',
      resolution: null,
      assignedToId: null,
      createdAt,
      updatedAt: createdAt,
    };
    (prisma.supportTicket.create as any).mockResolvedValueOnce(inserted);

    const result = await supportTicketService.create(author, payload);

    expect(result).toBe(inserted);
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(1);
    const arg = (prisma.supportTicket.create as any).mock.calls[0][0];
    expect(arg.data).toMatchObject({
      title: payload.title,
      description: payload.description,
      userId: author.id,
      userName: author.name,
      userRole: author.role,
    });
    // `code` é gerado no serviço — não vem do caller. Só validamos o formato.
    expect(arg.data.code).toMatch(/^SUP-\d{6}-[A-Z0-9]{4}$/);
    // status/resolution/assignedToId não são passados no data — ficam no
    // default do schema (OPEN / null / null).
    expect(arg.data.status).toBeUndefined();
    expect(arg.data.resolution).toBeUndefined();
    expect(arg.data.assignedToId).toBeUndefined();
  });

  it('retries on P2002 unique collision on `code` and succeeds on second attempt', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['code'] },
    });
    const inserted = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      code: 'SUP-260507-BBBB',
      title: payload.title,
      description: payload.description,
      userId: author.id,
      userName: author.name,
      userRole: author.role,
      status: 'OPEN',
      resolution: null,
      assignedToId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    (prisma.supportTicket.create as any)
      .mockRejectedValueOnce(collision)
      .mockResolvedValueOnce(inserted);

    const result = await supportTicketService.create(author, payload);

    expect(result).toBe(inserted);
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(2);
  });

  it('bubbles SupportTicketError(500, CODE_GENERATION_FAILED) after 5 collisions', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['code'] },
    });
    (prisma.supportTicket.create as any).mockRejectedValue(collision);

    await expect(supportTicketService.create(author, payload)).rejects.toMatchObject({
      httpStatus: 500,
      code: 'CODE_GENERATION_FAILED',
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(5);
  });

  it('does NOT retry on a non-P2002 error (e.g., FK violation) — rethrows immediately', async () => {
    const fkError = Object.assign(new Error('Foreign key constraint failed'), {
      code: 'P2003',
      meta: { field_name: 'userId' },
    });
    (prisma.supportTicket.create as any).mockRejectedValueOnce(fkError);

    await expect(supportTicketService.create(author, payload)).rejects.toBe(fkError);
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on P2002 on a different column (only `code` is regenerable)', async () => {
    const collision = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['id'] },
    });
    (prisma.supportTicket.create as any).mockRejectedValueOnce(collision);

    await expect(supportTicketService.create(author, payload)).rejects.toBe(collision);
    expect(prisma.supportTicket.create).toHaveBeenCalledTimes(1);
  });

  it('SupportTicketError is instanceof Error with httpStatus/code/message', () => {
    const err = new SupportTicketError(500, 'X', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err.httpStatus).toBe(500);
    expect(err.code).toBe('X');
    expect(err.message).toBe('msg');
  });
});
