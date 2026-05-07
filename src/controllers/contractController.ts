import { Request, Response, NextFunction } from 'express';
import {
  createContract,
  getContractById,
  getActiveContractByPropertyAndTenant,
  listLandlordTenants,
  listTenantContracts,
  updateContractStatus,
  updatePaymentStatus,
  ContractError
} from '../services/contractService';
import {
  createContractSchema,
  getContractQuerySchema,
  updateContractStatusSchema,
  updatePaymentStatusSchema
} from '../utils/contractValidation';
import { propertyService } from '../services/propertyService';

function handleContractError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof ContractError) {
    res.status(err.httpStatus).json({
      status: err.httpStatus,
      code: err.code,
      messages: [{ message: err.message }],
    });
    return true;
  }
  next(err);
  return false;
}

export const contractController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createContractSchema.parse(req.body);
      const contract = await createContract(input);
      return res.status(201).json(contract);
    } catch (err) {
      if (err instanceof ContractError) {
        return handleContractError(err, res, next);
      }
      next(err);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const contract = await getContractById(req.params.id);
      if (!contract) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Contract not found' }],
        });
      }
      return res.status(200).json(contract);
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/contracts?propertyId=<uuid>&tenantId=<uuid> (US-014)
   *
   * Retorna o contrato ACTIVE entre um imóvel e um tenant. Autorização:
   * caller precisa ser o landlord dono do imóvel OU o próprio tenant
   * indicado. Ordem dos guards (espelha US-012):
   *   1. 401 UNAUTHORIZED — antes de qualquer I/O.
   *   2. 400 VALIDATION_ERROR — Zod valida UUIDs sem tocar no banco.
   *   3. 404 NOT_FOUND — imóvel não existe; retornado ANTES da checagem
   *      de auth para manter paridade com o pattern estabelecido em
   *      US-012 (property primeiro, auth depois).
   *   4. 403 FORBIDDEN — caller não é landlord nem o tenant da query.
   *   5. 404 CONTRACT_NOT_FOUND — nenhum contrato ACTIVE para o par.
   *   6. 200 — view projetada (omite landlordId/dueDay/status/createdAt/
   *      updatedAt por contrato PRD). `pdfUrl`/`signedAt` = null quando
   *      ainda não houve upload.
   */
  async getByPropertyAndTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const localUser = req.localUser;
      if (!localUser) {
        return res.status(401).json({
          status: 401,
          code: 'UNAUTHORIZED',
          messages: [{ message: 'Authentication required.' }],
        });
      }

      const { propertyId, tenantId } = getContractQuerySchema.parse(req.query);

      const property = await propertyService.getPropertyById(propertyId);
      if (!property) {
        return res.status(404).json({
          status: 404,
          code: 'NOT_FOUND',
          messages: [{ message: 'Property not found' }],
        });
      }

      const isLandlord = localUser.id === property.landlordId;
      const isTenant = localUser.id === tenantId;
      if (!isLandlord && !isTenant) {
        return res.status(403).json({
          status: 403,
          code: 'FORBIDDEN',
          messages: [
            { message: 'Only the property owner or the specified tenant can read this contract.' },
          ],
        });
      }

      const contract = await getActiveContractByPropertyAndTenant(propertyId, tenantId);
      if (!contract) {
        return res.status(404).json({
          status: 404,
          code: 'CONTRACT_NOT_FOUND',
          messages: [{ message: 'No active contract between the property and the tenant.' }],
        });
      }

      // landlordId é usado só para autorização downstream; o contrato PRD
      // US-014 projeta apenas {id, propertyId, tenantId, startDate, endDate,
      // monthlyRent, pdfUrl, signedAt}.
      const { landlordId: _landlordId, ...view } = contract;
      return res.status(200).json(view);
    } catch (err) {
      next(err);
    }
  },

  async listTenants(req: Request, res: Response, next: NextFunction) {
    try {
      const landlordId = req.query.landlordId as string;
      if (!landlordId) {
        return res.status(400).json({ status: 400, code: 'MISSING_PARAM', messages: [{ message: 'landlordId is required' }] });
      }
      const tenants = await listLandlordTenants(landlordId);
      return res.status(200).json(tenants);
    } catch (err) {
      next(err);
    }
  },

  async listByTenant(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.params.tenantId;
      const contracts = await listTenantContracts(tenantId);
      return res.status(200).json(contracts);
    } catch (err) {
      next(err);
    }
  },

  async updatePayment(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updatePaymentStatusSchema.parse(req.body);
      const payment = await updatePaymentStatus(req.params.paymentId, input.status, input.paidDate);
      return res.status(200).json(payment);
    } catch (err) {
      next(err);
    }
  },

  async updateStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const input = updateContractStatusSchema.parse(req.body);
      const contract = await updateContractStatus(req.params.id, input.status);
      return res.status(200).json(contract);
    } catch (err) {
      if (err instanceof ContractError) {
        return handleContractError(err, res, next);
      }
      next(err);
    }
  }
};
