import prisma from '../config/db';
import { Prisma, ContractStatus, PaymentStatus } from '@prisma/client';

export class ContractError extends Error {
  constructor(
    public httpStatus: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ContractError';
  }
}

const TERMINAL_CONTRACT_STATUSES: ContractStatus[] = ['TERMINATED', 'COMPLETED'];

export async function createContract(data: any) {
  const { propertyId, tenantId, landlordId, startDate, endDate, monthlyRent, dueDay, pdfUrl } = data;

  return prisma.$transaction(async (tx) => {
    // Guard: exactly one ACTIVE contract allowed per property. Any attempt to
    // activate a second rental while one is already active throws 409 and
    // rolls back the entire transaction — no partial Property.status write.
    const existingActive = await tx.contract.findFirst({
      where: { propertyId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (existingActive) {
      throw new ContractError(
        409,
        'RENTAL_PROCESS_ALREADY_ACTIVE',
        'There is already an active rental for this property',
      );
    }

    // 1. Create the contract
    const contract = await tx.contract.create({
      data: {
        propertyId,
        tenantId,
        landlordId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        monthlyRent: new Prisma.Decimal(monthlyRent),
        dueDay,
        pdfUrl,
        status: 'ACTIVE',
      },
      include: {
        property: true,
        tenant: true,
        landlord: true,
      }
    });

    // 2. Update property status to RENTED in the SAME transaction — if this
    // tx is rolled back by a later failure, Property.status reverts too.
    await tx.property.update({
      where: { id: propertyId },
      data: { status: 'RENTED' }
    });

    return contract;
  });
}

export async function updateContractStatus(id: string, newStatus: ContractStatus) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.contract.findUnique({
      where: { id },
      select: { id: true, status: true, propertyId: true },
    });

    if (!existing) {
      throw new ContractError(404, 'CONTRACT_NOT_FOUND', 'Contract not found');
    }

    if (existing.status === newStatus) {
      // no-op status write — still return the contract shape so the controller
      // can respond 200 consistently.
      return tx.contract.findUnique({
        where: { id },
        include: { property: true, tenant: true, landlord: true },
      });
    }

    // Re-activation guard: if transitioning FROM a terminal status BACK TO
    // ACTIVE, enforce the same single-active-contract invariant.
    if (newStatus === 'ACTIVE' && existing.status !== 'ACTIVE') {
      const otherActive = await tx.contract.findFirst({
        where: {
          propertyId: existing.propertyId,
          status: 'ACTIVE',
          id: { not: id },
        },
        select: { id: true },
      });
      if (otherActive) {
        throw new ContractError(
          409,
          'RENTAL_PROCESS_ALREADY_ACTIVE',
          'There is already an active rental for this property',
        );
      }
    }

    const updated = await tx.contract.update({
      where: { id },
      data: { status: newStatus },
      include: { property: true, tenant: true, landlord: true },
    });

    // Auto-transition Property.status in the same transaction:
    //   ACTIVE        → terminal (TERMINATED/COMPLETED): property → AVAILABLE
    //   non-ACTIVE    → ACTIVE                          : property → RENTED
    if (existing.status === 'ACTIVE' && TERMINAL_CONTRACT_STATUSES.includes(newStatus)) {
      await tx.property.update({
        where: { id: existing.propertyId },
        data: { status: 'AVAILABLE' },
      });
    } else if (newStatus === 'ACTIVE' && existing.status !== 'ACTIVE') {
      await tx.property.update({
        where: { id: existing.propertyId },
        data: { status: 'RENTED' },
      });
    }

    return updated;
  });
}

export async function getContractById(id: string) {
  return prisma.contract.findUnique({
    where: { id },
    include: {
      property: true,
      tenant: { select: { id: true, name: true, email: true, phoneNumber: true } },
      landlord: { select: { id: true, name: true, email: true, phoneNumber: true } },
      payments: true,
    }
  });
}

export async function listLandlordTenants(landlordId: string) {
  // Finds users who have active contracts with this landlord
  const tenants = await prisma.user.findMany({
    where: {
      contractsAsTenant: {
        some: {
          landlordId,
          status: 'ACTIVE'
        }
      }
    },
    include: {
      contractsAsTenant: {
        where: { landlordId, status: 'ACTIVE' },
        include: {
          property: {
            select: { id: true, title: true, address: true }
          }
        }
      }
    }
  });

  return tenants.map(t => ({
    id: t.id,
    name: t.name,
    email: t.email,
    phoneNumber: t.phoneNumber,
    activeContracts: t.contractsAsTenant
  }));
}

export async function listTenantContracts(tenantId: string) {
  return prisma.contract.findMany({
    where: { tenantId },
    include: {
      property: { select: { id: true, title: true, address: true } },
      landlord: { select: { id: true, name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function updatePaymentStatus(paymentId: string, status: PaymentStatus, paidDate?: string) {
  return prisma.tenantPayment.update({
    where: { id: paymentId },
    data: {
      status,
      paidDate: paidDate ? new Date(paidDate) : undefined
    }
  });
}
