import { Request, Response, NextFunction } from 'express';
import { propertyService } from '../services/propertyService';
import { createPropertySchema, updatePropertySchema } from '../utils/propertyValidation';

export const propertyController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createPropertySchema.parse(req.body);
      const property = await propertyService.createProperty(validatedData);
      return res.status(201).json(property);
    } catch (error) {
      next(error);
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const properties = await propertyService.listProperties();
      return res.status(200).json(properties);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const property = await propertyService.getPropertyById(id);

      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }]
        });
      }

      return res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const validatedData = updatePropertySchema.parse(req.body);
      const property = await propertyService.updateProperty(id, validatedData);

      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }]
        });
      }

      return res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const success = await propertyService.deleteProperty(id);

      if (!success) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }]
        });
      }

      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
};
