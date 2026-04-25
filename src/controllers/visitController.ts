import { Request, Response, NextFunction } from 'express';
import {
  createVisit,
  listVisits,
  getVisitById,
  updateVisit,
  cancelVisit,
  listAvailableSlots,
  VisitError,
} from '../services/visitService';
import {
  createVisitSchema,
  updateVisitSchema,
  listVisitsQuerySchema,
  availabilityQuerySchema,
} from '../utils/visitValidation';

function handleVisitError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof VisitError) {
    res.status(err.httpStatus).json({
      status: err.httpStatus,
      code: err.code,
      messages: [{ message: err.code }],
      ...(err.details ? { details: err.details } : {}),
    });
    return true;
  }
  next(err);
  return false;
}

export const visitController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createVisitSchema.parse(req.body);
      const visit = await createVisit(input);
      return res.status(201).json(visit);
    } catch (err) {
      if (err instanceof VisitError) {
        return handleVisitError(err, res, next);
      }
      next(err);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const query = listVisitsQuerySchema.parse(req.query);
      const visits = await listVisits(query);
      return res.status(200).json(visits);
    } catch (err) {
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const visit = await getVisitById(req.params.id);
      if (!visit) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Visit not found' }],
        });
      }
      return res.status(200).json(visit);
    } catch (err) {
      next(err);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateVisitSchema.parse(req.body);
      const visit = await updateVisit(req.params.id, input);
      if (!visit) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Visit not found' }],
        });
      }
      return res.status(200).json(visit);
    } catch (err) {
      if (err instanceof VisitError) {
        return handleVisitError(err, res, next);
      }
      next(err);
    }
  },

  async cancel(req: Request, res: Response, next: NextFunction) {
    try {
      const ok = await cancelVisit(req.params.id);
      if (!ok) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Visit not found' }],
        });
      }
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async availability(req: Request, res: Response, next: NextFunction) {
    try {
      const query = availabilityQuerySchema.parse(req.query);
      const slots = await listAvailableSlots(query);
      return res.status(200).json(slots);
    } catch (err) {
      if (err instanceof VisitError) {
        return handleVisitError(err, res, next);
      }
      next(err);
    }
  },
};
