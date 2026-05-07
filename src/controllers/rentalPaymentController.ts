import { Request, Response, NextFunction } from 'express';
import { propertyService } from '../services/propertyService';
import { rentalPaymentService } from '../services/rentalPaymentService';

export const rentalPaymentController = {
  /**
   * GET /api/properties/:id/payments/current
   *
   * Owner-only: 404 quando o imóvel não existe, 403 quando o usuário autenticado
   * não é o locador. A ordem 404→403 é a mesma usada em PUT /properties/:id
   * (US-006) — evita diferenciar 404 de 403 para ids inventados.
   *
   * Nunca retorna 404 por "não há pagamento registrado": o contrato com o UI é
   * responder AWAITING + updatedAt/updatedBy null quando a linha não existe
   * ainda (tratado em rentalPaymentService.getCurrent).
   */
  async getCurrent(req: Request, res: Response, next: NextFunction) {
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

      const property = await propertyService.getPropertyById(id);
      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }],
        });
      }
      if (property.landlordId !== localUser.id) {
        return res.status(403).json({
          status: 403,
          code: 'FORBIDDEN',
          messages: [{ message: 'Only the property owner can read rental payment status.' }],
        });
      }

      const payment = await rentalPaymentService.getCurrent(id);
      return res.status(200).json(payment);
    } catch (error) {
      next(error);
    }
  },
};
