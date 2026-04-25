import type { PrismaClient } from '@prisma/client';
import prisma from '../config/db';

export type RentalProcessPrismaClient = Pick<PrismaClient, 'rentalProcess'>;

export interface RentalProcessDeps {
  prisma: RentalProcessPrismaClient;
}

const defaultDeps: RentalProcessDeps = {
  prisma: prisma as RentalProcessPrismaClient,
};

export interface ProcessInsightsResult {
  processId: string;
  status: string;
  tenantId: string;
  propertyId: string | null;
  insights: Array<{
    id: string;
    insightKey: string;
    insightValue: string;
    extractedAt: Date;
  }>;
}

export async function getProcessInsights(
  processId: string,
  deps: RentalProcessDeps = defaultDeps,
): Promise<ProcessInsightsResult | null> {
  const process = await deps.prisma.rentalProcess.findUnique({
    where: { id: processId },
    include: {
      insights: {
        orderBy: { extractedAt: 'asc' },
      },
    },
  });
  if (!process) return null;

  return {
    processId: process.id,
    status: process.status,
    tenantId: process.tenantId,
    propertyId: process.propertyId,
    insights: process.insights.map((i) => ({
      id: i.id,
      insightKey: i.insightKey,
      insightValue: i.insightValue,
      extractedAt: i.extractedAt,
    })),
  };
}
