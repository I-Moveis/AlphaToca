import { Request, Response } from 'express';
import { propertyService } from '../services/propertyService';

export const propertyController = {
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const property = await propertyService.updateProperty(id, req.body);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    return res.status(200).json(property);
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const success = await propertyService.deleteProperty(id);

    if (!success) {
      return res.status(404).json({ error: 'Property not found' });
    }

    return res.status(204).send();
  }
};
