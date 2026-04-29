import { Request, Response, NextFunction } from 'express';
import { ModerationStatus } from '@prisma/client';
import prisma from '../config/db';
import { propertyService } from '../services/propertyService';

const PAGE_MIN = 1;
const LIMIT_MIN = 1;
const LIMIT_MAX = 100;

const parseIntParam = (raw: unknown, fallback: number, min: number, max: number): number => {
  if (typeof raw !== 'string') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

export const adminController = {
  async getMetrics(_req: Request, res: Response, next: NextFunction) {
    try {
      const [
        totalUsers,
        totalProperties,
        totalVisits,
        usersByRole,
        propertiesByStatus,
        propertiesByModeration,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.property.count(),
        prisma.visit.count(),
        prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
        prisma.property.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.property.groupBy({ by: ['moderationStatus'], _count: { _all: true } }),
      ]);

      const toCountMap = <K extends string>(rows: any[], key: K) =>
        rows.reduce<Record<string, number>>((acc, row) => {
          acc[row[key] as string] = row._count._all;
          return acc;
        }, {});

      const pendingModeration =
        propertiesByModeration.find((r) => r.moderationStatus === ModerationStatus.PENDING)
          ?._count._all ?? 0;

      return res.status(200).json({
        totals: {
          users: totalUsers,
          properties: totalProperties,
          visits: totalVisits,
          pendingModeration,
        },
        usersByRole: toCountMap(usersByRole, 'role'),
        propertiesByStatus: toCountMap(propertiesByStatus, 'status'),
        propertiesByModeration: toCountMap(propertiesByModeration, 'moderationStatus'),
        generatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  },

  async listPendingProperties(req: Request, res: Response, next: NextFunction) {
    try {
      const statusParam = typeof req.query.status === 'string'
        ? (req.query.status as string).toUpperCase()
        : undefined;

      const status =
        statusParam && (Object.values(ModerationStatus) as string[]).includes(statusParam)
          ? (statusParam as ModerationStatus)
          : ModerationStatus.PENDING;

      const page = parseIntParam(req.query.page, 1, PAGE_MIN, Number.MAX_SAFE_INTEGER);
      const limit = parseIntParam(req.query.limit, 20, LIMIT_MIN, LIMIT_MAX);

      const result = await propertyService.listForModeration({ status, page, limit });
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
};
