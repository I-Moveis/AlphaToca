import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

import { listAvailableSlots } from './visitService';

// TTL da proposta de agendamento. Se o usuário confirmar após este prazo,
// o worker descarta a proposta e reinicia o fluxo de propor/confirmar.
export const PROPOSAL_TTL_MS = 15 * 60 * 1000;

export type ProposalPrismaClient = Pick<PrismaClient, 'chatSession'>;

// Schema compartilhado: LLM envia ISO strings, convertemos p/ Date.
const checkAvailabilitySchema = z.object({
  propertyId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
});

const proposeVisitSchema = z.object({
  propertyId: z.string().uuid(),
  scheduledAt: z.string(),
});

export function createCheckAvailabilityTool() {
  return tool(
    async ({ propertyId, from, to }) => {
      try {
        const slots = await listAvailableSlots({
          propertyId,
          from: new Date(from),
          to: new Date(to),
          slotMinutes: 45,
        });
        // Limita a 10 slots para caber no contexto da LLM
        const payload = slots.slice(0, 10).map((s) => ({
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
        }));
        return JSON.stringify(payload);
      } catch (err) {
        return JSON.stringify({
          error: (err as Error).message ?? 'unknown_error',
        });
      }
    },
    {
      name: 'check_availability',
      description:
        'Consulta horários livres (slots) de uma propriedade entre duas datas. Use quando o inquilino pedir para agendar visita ou quiser saber quando pode visitar. Params: propertyId (uuid), from/to (ISO-8601 datetime).',
      schema: checkAvailabilitySchema,
    },
  );
}

export interface ProposeVisitDeps {
  sessionId: string;
  prisma: ProposalPrismaClient;
}

export function createProposeVisitSlotTool(deps: ProposeVisitDeps) {
  return tool(
    async ({ propertyId, scheduledAt }) => {
      const proposal = {
        propertyId,
        scheduledAt,
        expiresAt: Date.now() + PROPOSAL_TTL_MS,
      };
      await deps.prisma.chatSession.update({
        where: { id: deps.sessionId },
        data: { pendingProposal: proposal as unknown as object },
      });
      return JSON.stringify(proposal);
    },
    {
      name: 'propose_visit_slot',
      description:
        'Registra uma PROPOSTA de horário para o inquilino confirmar. NÃO agenda nada — apenas salva a proposta e retorna os dados. Após chamar esta tool, apresente o horário em texto e pergunte se o usuário confirma; se o próximo turno confirmar, o sistema cria a visita definitiva automaticamente.',
      schema: proposeVisitSchema,
    },
  );
}
