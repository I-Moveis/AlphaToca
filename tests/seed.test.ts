import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { main } from '../prisma/seed';

const { mockPrismaClient } = vi.hoisted(() => {
  return {
    mockPrismaClient: {
      user: { deleteMany: vi.fn(), createMany: vi.fn() },
      property: { deleteMany: vi.fn(), createMany: vi.fn() },
      chatSession: { deleteMany: vi.fn(), createMany: vi.fn() },
      message: { deleteMany: vi.fn(), createMany: vi.fn() },
      knowledgeDocument: { deleteMany: vi.fn(), createMany: vi.fn(), create: vi.fn() },
      rentalDocument: { deleteMany: vi.fn().mockResolvedValue(true) },
      aiExtractedInsight: { deleteMany: vi.fn().mockResolvedValue(true) },
      rentalProcess: { deleteMany: vi.fn().mockResolvedValue(true) },
      $executeRawUnsafe: vi.fn(),
      $disconnect: vi.fn(),
    }
  };
});

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      constructor() {
        return mockPrismaClient;
      }
    }
  };
});

describe('Seeding Script', () => {
  it('should clear the database and insert new records', async () => {
    const prisma = new PrismaClient();
    await main();

    expect(prisma.message.deleteMany).toHaveBeenCalled();
    expect(prisma.chatSession.deleteMany).toHaveBeenCalled();
    expect(prisma.property.deleteMany).toHaveBeenCalled();
    expect(prisma.user.deleteMany).toHaveBeenCalled();
    expect(prisma.knowledgeDocument.deleteMany).toHaveBeenCalled();

    expect(prisma.user.createMany).toHaveBeenCalled();
    expect(prisma.property.createMany).toHaveBeenCalled();
    expect(prisma.chatSession.createMany).toHaveBeenCalled();
    expect(prisma.message.createMany).toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
  });
});


