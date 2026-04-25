import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockListAvailableSlots } = vi.hoisted(() => ({
  mockListAvailableSlots: vi.fn(),
}));

vi.mock('../src/services/visitService', () => ({
  listAvailableSlots: mockListAvailableSlots,
}));

import {
  createCheckAvailabilityTool,
  createProposeVisitSlotTool,
  PROPOSAL_TTL_MS,
  type ProposalPrismaClient,
} from '../src/services/ragTools';

function makeProposalPrisma() {
  const update = vi.fn(async () => ({ id: 'session-1' }));
  return {
    prisma: { chatSession: { update } } as unknown as ProposalPrismaClient,
    update,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCheckAvailabilityTool', () => {
  it('exposes name and a zod schema', () => {
    const tool = createCheckAvailabilityTool();
    expect(tool.name).toBe('check_availability');
    expect(tool.description).toMatch(/disponibilidade|available|livres/i);
    expect(tool.schema).toBeDefined();
  });

  it('invokes visitService.listAvailableSlots with coerced Date args', async () => {
    mockListAvailableSlots.mockResolvedValueOnce([
      { startsAt: new Date('2026-05-10T14:00:00Z'), endsAt: new Date('2026-05-10T14:45:00Z') },
    ]);

    const tool = createCheckAvailabilityTool();
    const result = await tool.invoke({
      propertyId: '11111111-1111-1111-1111-111111111111',
      from: '2026-05-10T13:00:00Z',
      to: '2026-05-10T16:00:00Z',
    });

    expect(mockListAvailableSlots).toHaveBeenCalledTimes(1);
    const callArg = mockListAvailableSlots.mock.calls[0][0];
    expect(callArg.propertyId).toBe('11111111-1111-1111-1111-111111111111');
    expect(callArg.from).toBeInstanceOf(Date);
    expect(callArg.to).toBeInstanceOf(Date);

    // tool must return a string (LangChain content)
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result as string);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].startsAt).toBeDefined();
  });

  it('returns JSON with error string when service throws', async () => {
    mockListAvailableSlots.mockRejectedValueOnce(new Error('PROPERTY_NOT_FOUND'));
    const tool = createCheckAvailabilityTool();
    const result = await tool.invoke({
      propertyId: '11111111-1111-1111-1111-111111111111',
      from: '2026-05-10T13:00:00Z',
      to: '2026-05-10T16:00:00Z',
    });
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result as string);
    expect(parsed.error).toBeDefined();
  });
});

describe('createProposeVisitSlotTool', () => {
  it('writes pendingProposal to ChatSession and does NOT create a Visit', async () => {
    const { prisma, update } = makeProposalPrisma();
    const tool = createProposeVisitSlotTool({
      sessionId: 'session-1',
      prisma,
    });

    const result = await tool.invoke({
      propertyId: '11111111-1111-1111-1111-111111111111',
      scheduledAt: '2026-05-10T14:00:00Z',
    });

    expect(update).toHaveBeenCalledTimes(1);
    const callArg = update.mock.calls[0][0];
    expect(callArg.where).toEqual({ id: 'session-1' });
    expect(callArg.data.pendingProposal).toBeDefined();
    expect(callArg.data.pendingProposal.propertyId).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
    expect(callArg.data.pendingProposal.scheduledAt).toBe('2026-05-10T14:00:00Z');
    expect(callArg.data.pendingProposal.expiresAt).toBeGreaterThan(Date.now());

    // Returns string (JSON) with the proposal info
    expect(typeof result).toBe('string');
    const parsed = JSON.parse(result as string);
    expect(parsed.propertyId).toBe('11111111-1111-1111-1111-111111111111');
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });

  it('uses PROPOSAL_TTL_MS for expiresAt', async () => {
    const { prisma } = makeProposalPrisma();
    const tool = createProposeVisitSlotTool({
      sessionId: 'session-1',
      prisma,
    });

    const before = Date.now();
    const result = await tool.invoke({
      propertyId: '11111111-1111-1111-1111-111111111111',
      scheduledAt: '2026-05-10T14:00:00Z',
    });
    const after = Date.now();

    const parsed = JSON.parse(result as string);
    expect(parsed.expiresAt).toBeGreaterThanOrEqual(before + PROPOSAL_TTL_MS);
    expect(parsed.expiresAt).toBeLessThanOrEqual(after + PROPOSAL_TTL_MS);
  });

  it('has description guiding the LLM to propose and NOT schedule', () => {
    const { prisma } = makeProposalPrisma();
    const tool = createProposeVisitSlotTool({ sessionId: 's', prisma });
    expect(tool.name).toBe('propose_visit_slot');
    expect(tool.description).toMatch(/propor|confirm|NÃO agenda|NOT schedule/i);
  });
});
