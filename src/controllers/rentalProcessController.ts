import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getProcessInsights } from '../services/rentalProcessService';

const idSchema = z.string().uuid({ message: 'Invalid rental process id format' });

export const rentalProcessController = {
  async getInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const id = idSchema.parse(req.params.id);
      const result = await getProcessInsights(id);
      if (!result) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Rental process not found' }],
        });
      }
      return res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
};
