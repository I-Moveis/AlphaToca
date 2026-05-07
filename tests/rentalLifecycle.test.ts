import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma BEFORE importing the services. Each model that the services
// touch must be declared here — vi.mock's factory is hoisted.
vi.mock('../src/config/db', () => {
  const contract = {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const property = {
    update: vi.fn(),
  };
  const rentalProcess = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };

  // $transaction(fn) — by default, runs the callback with a `tx` object that
  // mirrors the top-level prisma client. Individual tests can re-implement
  // the $transaction mock to simulate rollback on failure.
  const $transaction = vi.fn(async (fn: (tx: any) => Promise<any>) => {
    return fn({ contract, property, rentalProcess });
  });

  return {
    default: { contract, property, rentalProcess, $transaction },
  };
});

import prisma from '../src/config/db';
import {
  createContract,
  updateContractStatus,
  ContractError,
} from '../src/services/contractService';
import { rentalProcessService } from '../src/services/rentalProcessService';

const PROPERTY_ID = '33333333-3333-3333-3333-333333333333';
const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const LANDLORD_ID = '11111111-1111-1111-1111-111111111111';
const CONTRACT_ID = '44444444-4444-4444-4444-444444444444';
const RP_ID = '55555555-5555-5555-5555-555555555555';

const validContractInput = {
  propertyId: PROPERTY_ID,
  tenantId: TENANT_ID,
  landlordId: LANDLORD_ID,
  startDate: '2026-05-07T00:00:00.000Z',
  endDate: '2027-05-07T00:00:00.000Z',
  monthlyRent: 2500,
  dueDay: 10,
  contractUrl: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ACTIVATION — createContract flips Property.status → RENTED in the same tx
// ---------------------------------------------------------------------------
describe('contractService.createContract — activation (US-005)', () => {
  it('creates contract with status=ACTIVE AND sets Property.status=RENTED in the same transaction', async () => {
    (prisma.contract.findFirst as any).mockResolvedValue(null);
    (prisma.contract.create as any).mockResolvedValue({ id: CONTRACT_ID, status: 'ACTIVE' });
    (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID, status: 'RENTED' });

    const result = await createContract(validContractInput);

    expect(result).toMatchObject({ id: CONTRACT_ID, status: 'ACTIVE' });

    // All three writes/reads flowed through exactly one $transaction boundary
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.contract.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.contract.create).toHaveBeenCalledTimes(1);
    expect(prisma.property.update).toHaveBeenCalledTimes(1);

    // Property side-effect targets the right id with status=RENTED
    const propArg = (prisma.property.update as any).mock.calls[0][0];
    expect(propArg).toEqual({ where: { id: PROPERTY_ID }, data: { status: 'RENTED' } });
  });

  it('throws 409 RENTAL_PROCESS_ALREADY_ACTIVE and does NOT mutate state when another ACTIVE contract exists', async () => {
    (prisma.contract.findFirst as any).mockResolvedValue({ id: 'some-other-contract' });

    await expect(createContract(validContractInput)).rejects.toMatchObject({
      name: 'ContractError',
      httpStatus: 409,
      code: 'RENTAL_PROCESS_ALREADY_ACTIVE',
    });

    // The guard must reject BEFORE the create/property writes run
    expect(prisma.contract.create).not.toHaveBeenCalled();
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('rolls back Property.status when a later write inside the transaction fails', async () => {
    // Simulate: findFirst succeeds → contract.create succeeds → property.update throws.
    // The $transaction wrapper must propagate the throw and, per Prisma semantics,
    // nothing committed. We verify by asserting our service did NOT return and
    // that the caller sees the underlying error, with no successful "commit" side effects.
    (prisma.contract.findFirst as any).mockResolvedValue(null);
    (prisma.contract.create as any).mockResolvedValue({ id: CONTRACT_ID, status: 'ACTIVE' });

    const txError = new Error('property.update failed');
    (prisma.property.update as any).mockRejectedValue(txError);

    // Replace the default $transaction mock for this test with one that
    // simulates Prisma's real rollback semantics — any throw inside the
    // callback surfaces to the caller and NOTHING is "committed" from the
    // callback's perspective (the test already asserts via the mocks that
    // property.update is the final call and that the error bubbles up).
    let committed = true;
    (prisma.$transaction as any).mockImplementationOnce(async (fn: any) => {
      try {
        return await fn({
          contract: prisma.contract,
          property: prisma.property,
          rentalProcess: prisma.rentalProcess,
        });
      } catch (err) {
        committed = false;
        throw err;
      }
    });

    await expect(createContract(validContractInput)).rejects.toThrow('property.update failed');
    expect(committed).toBe(false);
    // contract.create was called but since the tx rolled back, the service
    // never returned a value — downstream callers must treat this as a failure.
    expect(prisma.contract.create).toHaveBeenCalledTimes(1);
    expect(prisma.property.update).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// TERMINATION — updateContractStatus resets Property.status → AVAILABLE
// ---------------------------------------------------------------------------
describe('contractService.updateContractStatus — termination (US-005)', () => {
  it('ACTIVE → TERMINATED flips Property.status to AVAILABLE in the same transaction', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'ACTIVE',
      propertyId: PROPERTY_ID,
    });
    (prisma.contract.update as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'TERMINATED',
      propertyId: PROPERTY_ID,
    });
    (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID, status: 'AVAILABLE' });

    const result = await updateContractStatus(CONTRACT_ID, 'TERMINATED');

    expect(result).toMatchObject({ id: CONTRACT_ID, status: 'TERMINATED' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Property update was made with status=AVAILABLE
    expect(prisma.property.update).toHaveBeenCalledTimes(1);
    const propArg = (prisma.property.update as any).mock.calls[0][0];
    expect(propArg).toEqual({ where: { id: PROPERTY_ID }, data: { status: 'AVAILABLE' } });
  });

  it('ACTIVE → COMPLETED also flips Property.status to AVAILABLE', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'ACTIVE',
      propertyId: PROPERTY_ID,
    });
    (prisma.contract.update as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'COMPLETED',
      propertyId: PROPERTY_ID,
    });
    (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID, status: 'AVAILABLE' });

    await updateContractStatus(CONTRACT_ID, 'COMPLETED');

    const propArg = (prisma.property.update as any).mock.calls[0][0];
    expect(propArg).toEqual({ where: { id: PROPERTY_ID }, data: { status: 'AVAILABLE' } });
  });

  it('throws 404 CONTRACT_NOT_FOUND when contract does not exist', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue(null);

    await expect(updateContractStatus(CONTRACT_ID, 'TERMINATED')).rejects.toMatchObject({
      name: 'ContractError',
      httpStatus: 404,
      code: 'CONTRACT_NOT_FOUND',
    });

    expect(prisma.contract.update).not.toHaveBeenCalled();
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('same-state transition (ACTIVE → ACTIVE) is a no-op and does not touch Property', async () => {
    (prisma.contract.findUnique as any)
      .mockResolvedValueOnce({ id: CONTRACT_ID, status: 'ACTIVE', propertyId: PROPERTY_ID })
      .mockResolvedValueOnce({ id: CONTRACT_ID, status: 'ACTIVE' });

    await updateContractStatus(CONTRACT_ID, 'ACTIVE');

    expect(prisma.contract.update).not.toHaveBeenCalled();
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('re-activating a terminated contract while another is already ACTIVE throws 409', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'TERMINATED',
      propertyId: PROPERTY_ID,
    });
    (prisma.contract.findFirst as any).mockResolvedValue({ id: 'another-active-contract' });

    await expect(updateContractStatus(CONTRACT_ID, 'ACTIVE')).rejects.toMatchObject({
      name: 'ContractError',
      httpStatus: 409,
      code: 'RENTAL_PROCESS_ALREADY_ACTIVE',
    });

    expect(prisma.contract.update).not.toHaveBeenCalled();
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('re-activating a terminated contract (no other ACTIVE) flips Property.status to RENTED', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'TERMINATED',
      propertyId: PROPERTY_ID,
    });
    (prisma.contract.findFirst as any).mockResolvedValue(null);
    (prisma.contract.update as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'ACTIVE',
      propertyId: PROPERTY_ID,
    });
    (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID, status: 'RENTED' });

    await updateContractStatus(CONTRACT_ID, 'ACTIVE');

    const propArg = (prisma.property.update as any).mock.calls[0][0];
    expect(propArg).toEqual({ where: { id: PROPERTY_ID }, data: { status: 'RENTED' } });
  });

  it('rolls back Property.status mutation when contract.update fails mid-transaction', async () => {
    (prisma.contract.findUnique as any).mockResolvedValue({
      id: CONTRACT_ID,
      status: 'ACTIVE',
      propertyId: PROPERTY_ID,
    });
    (prisma.contract.update as any).mockRejectedValue(new Error('contract.update failed'));

    let committed = true;
    (prisma.$transaction as any).mockImplementationOnce(async (fn: any) => {
      try {
        return await fn({
          contract: prisma.contract,
          property: prisma.property,
          rentalProcess: prisma.rentalProcess,
        });
      } catch (err) {
        committed = false;
        throw err;
      }
    });

    await expect(updateContractStatus(CONTRACT_ID, 'TERMINATED')).rejects.toThrow(
      'contract.update failed',
    );
    expect(committed).toBe(false);
    // The property.update must NOT have been invoked — contract.update threw first
    expect(prisma.property.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// RentalProcess CLOSED — releases NEGOTIATING property back to AVAILABLE
// ---------------------------------------------------------------------------
describe('rentalProcessService.updateStatus — CLOSED terminal (US-005)', () => {
  it('CLOSED with property in NEGOTIATING releases Property.status to AVAILABLE in the same tx', async () => {
    (prisma.rentalProcess.findUnique as any).mockResolvedValue({
      id: RP_ID,
      status: 'CONTRACT_ANALYSIS',
      tenant: { id: TENANT_ID, fcmToken: null },
      property: {
        id: PROPERTY_ID,
        title: 'Apto Centro',
        status: 'NEGOTIATING',
        landlord: { id: LANDLORD_ID, fcmToken: null },
      },
    });
    (prisma.rentalProcess.update as any).mockResolvedValue({
      id: RP_ID,
      status: 'CLOSED',
    });
    (prisma.property.update as any).mockResolvedValue({ id: PROPERTY_ID, status: 'AVAILABLE' });

    const result = await rentalProcessService.updateStatus(RP_ID, 'CLOSED');

    expect(result).toMatchObject({ id: RP_ID, status: 'CLOSED' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const propArg = (prisma.property.update as any).mock.calls[0][0];
    expect(propArg).toEqual({ where: { id: PROPERTY_ID }, data: { status: 'AVAILABLE' } });
  });

  it('CLOSED with property already RENTED (contract active) leaves Property.status untouched', async () => {
    (prisma.rentalProcess.findUnique as any).mockResolvedValue({
      id: RP_ID,
      status: 'CONTRACT_ANALYSIS',
      tenant: { id: TENANT_ID, fcmToken: null },
      property: {
        id: PROPERTY_ID,
        title: 'Apto Centro',
        status: 'RENTED',
        landlord: { id: LANDLORD_ID, fcmToken: null },
      },
    });
    (prisma.rentalProcess.update as any).mockResolvedValue({
      id: RP_ID,
      status: 'CLOSED',
    });

    await rentalProcessService.updateStatus(RP_ID, 'CLOSED');

    // Only the rental-process update; no property.update — contract termination
    // is the authoritative path to flip RENTED → AVAILABLE.
    expect(prisma.rentalProcess.update).toHaveBeenCalledTimes(1);
    expect(prisma.property.update).not.toHaveBeenCalled();
  });

  it('VISIT_SCHEDULED (non-terminal) does NOT trigger property release even if property is NEGOTIATING', async () => {
    (prisma.rentalProcess.findUnique as any).mockResolvedValue({
      id: RP_ID,
      status: 'TRIAGE',
      tenant: { id: TENANT_ID, fcmToken: null },
      property: {
        id: PROPERTY_ID,
        title: 'Apto Centro',
        status: 'NEGOTIATING',
        landlord: { id: LANDLORD_ID, fcmToken: null },
      },
    });
    (prisma.rentalProcess.update as any).mockResolvedValue({
      id: RP_ID,
      status: 'VISIT_SCHEDULED',
    });

    await rentalProcessService.updateStatus(RP_ID, 'VISIT_SCHEDULED');

    expect(prisma.property.update).not.toHaveBeenCalled();
  });
});
