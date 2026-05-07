import { Request, Response, NextFunction } from 'express';
import { propertyService, PropertyError } from '../services/propertyService';
import { profileViewService } from '../services/profileViewService';
import {
  createPropertySchema,
  moderatePropertySchema,
  updatePropertySchema,
} from '../utils/propertyValidation';
import { propertySearchSchema } from '../utils/searchValidation';

export const propertyController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = createPropertySchema.parse(req.body);
      const files = req.files as Express.Multer.File[] | undefined;
      const property = await propertyService.createProperty(validatedData, files);
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

  async search(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedParams = propertySearchSchema.parse(req.query);
      const result = await propertyService.searchProperties(validatedParams);
      return res.status(200).json(result);
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

      // LL-001: o card "Visitas ao perfil" do dashboard do landlord conta
      // aberturas do perfil público nos últimos 30 dias. O frontend marca o
      // request com ?inspectLandlord=true quando o tenant está olhando o
      // locador a partir da ficha do imóvel. Fire-and-forget: nunca bloqueia
      // a resposta da propriedade.
      if (req.query.inspectLandlord === 'true') {
        void profileViewService.record(property.landlordId, req.localUser?.id ?? null);
      }

      return res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const localUser = req.localUser;
      if (!localUser) {
        return res.status(401).json({
          status: 401,
          code: 'UNAUTHORIZED',
          messages: [{ message: 'Authentication required.' }],
        });
      }

      // Ownership guard antes de validar body: evita vazar informação sobre o
      // imóvel (shape de erro) pra callers que não são o dono. 404 se não existe
      // (padrão dos outros handlers), 403 se existe mas não é seu.
      const existing = await propertyService.getPropertyById(id);
      if (!existing) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }],
        });
      }
      if (existing.landlordId !== localUser.id) {
        return res.status(403).json({
          status: 403,
          code: 'FORBIDDEN',
          messages: [{ message: 'Only the property owner can update this property.' }],
        });
      }

      const validatedData = updatePropertySchema.parse(req.body);
      const files = req.files as Express.Multer.File[] | undefined;
      const property = await propertyService.updateProperty(id, validatedData, files);

      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }]
        });
      }

      return res.status(200).json(property);
    } catch (error) {
      if (error instanceof PropertyError) {
        return res.status(error.httpStatus).json({
          status: error.httpStatus,
          code: error.code,
          messages: [{ message: error.message }],
        });
      }
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
  },

  async moderate(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const moderator = req.localUser;
      if (!moderator) {
        return res.status(401).json({
          status: 401,
          code: 'UNAUTHORIZED',
          messages: [{ message: 'Moderator profile not found on request.' }],
        });
      }

      const { decision, reason } = moderatePropertySchema.parse(req.body);
      const property = await propertyService.moderateProperty(id, decision, moderator.id, reason);

      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }],
        });
      }

      return res.status(200).json(property);
    } catch (error) {
      next(error);
    }
  },
};
