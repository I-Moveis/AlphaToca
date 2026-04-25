import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createVisit,
  listVisits,
  getVisitById,
  updateVisit,
  cancelVisit,
  listAvailableSlots,
  VisitError,
  type VisitDeps,
} from '../src/services/visitService';

type FakeProperty = {
  id: string;
  landlordId: string;
};

type FakeVisit = {
  id: string;
  propertyId: string;
  tenantId: string;
  landlordId: string;
  rentalProcessId: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface VisitHarness {
  deps: VisitDeps;
  state: {
    properties: FakeProperty[];
    visits: FakeVisit[];
  };
  mocks: {
    propertyFindUnique: ReturnType<typeof vi.fn>;
    visitFindUnique: ReturnType<typeof vi.fn>;
    visitFindMany: ReturnType<typeof vi.fn>;
    visitCreate: ReturnType<typeof vi.fn>;
    visitUpdate: ReturnType<typeof vi.fn>;
  };
}

function makeHarness(opts: {
  properties?: FakeProperty[];
  visits?: FakeVisit[];
} = {}): VisitHarness {
  const properties: FakeProperty[] = (opts.properties ?? []).map((p) => ({ ...p }));
  const visits: FakeVisit[] = (opts.visits ?? []).map((v) => ({ ...v }));

  const propertyFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    return properties.find((p) => p.id === where.id) ?? null;
  });

  const visitFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
    return visits.find((v) => v.id === where.id) ?? null;
  });

  const visitFindMany = vi.fn(
    async ({
      where,
    }: {
      where: {
        status?: { in?: string[] } | string;
        OR?: Array<{ propertyId?: string; landlordId?: string }>;
        propertyId?: string;
        tenantId?: string;
        landlordId?: string;
        scheduledAt?: { gte?: Date; lte?: Date };
        NOT?: { id: string };
      };
      orderBy?: unknown;
    }) => {
      return visits
        .filter((v) => {
          if (where.NOT?.id && v.id === where.NOT.id) return false;
          if (typeof where.status === 'string' && v.status !== where.status) return false;
          if (where.status && typeof where.status === 'object' && where.status.in) {
            if (!where.status.in.includes(v.status)) return false;
          }
          if (where.propertyId && v.propertyId !== where.propertyId) return false;
          if (where.tenantId && v.tenantId !== where.tenantId) return false;
          if (where.landlordId && v.landlordId !== where.landlordId) return false;
          if (where.OR) {
            const matches = where.OR.some((cond) => {
              if (cond.propertyId && v.propertyId === cond.propertyId) return true;
              if (cond.landlordId && v.landlordId === cond.landlordId) return true;
              return false;
            });
            if (!matches) return false;
          }
          if (where.scheduledAt?.gte && v.scheduledAt < where.scheduledAt.gte) return false;
          if (where.scheduledAt?.lte && v.scheduledAt > where.scheduledAt.lte) return false;
          return true;
        })
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
    },
  );

  const visitCreate = vi.fn(
    async ({
      data,
    }: {
      data: {
        propertyId: string;
        tenantId: string;
        landlordId: string;
        rentalProcessId?: string | null;
        scheduledAt: Date;
        durationMinutes?: number;
        status?: FakeVisit['status'];
        notes?: string | null;
      };
    }) => {
      const now = new Date();
      const row: FakeVisit = {
        id: `v-${visits.length + 1}`,
        propertyId: data.propertyId,
        tenantId: data.tenantId,
        landlordId: data.landlordId,
        rentalProcessId: data.rentalProcessId ?? null,
        scheduledAt: data.scheduledAt,
        durationMinutes: data.durationMinutes ?? 45,
        status: data.status ?? 'SCHEDULED',
        notes: data.notes ?? null,
        createdAt: now,
        updatedAt: now,
      };
      visits.push(row);
      return row;
    },
  );

  const visitUpdate = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeVisit>;
    }) => {
      const row = visits.find((v) => v.id === where.id);
      if (!row) throw new Error(`visit ${where.id} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  );

  return {
    deps: {
      prisma: {
        property: { findUnique: propertyFindUnique },
        visit: {
          findUnique: visitFindUnique,
          findMany: visitFindMany,
          create: visitCreate,
          update: visitUpdate,
        },
      } as unknown as VisitDeps['prisma'],
    },
    state: { properties, visits },
    mocks: {
      propertyFindUnique,
      visitFindUnique,
      visitFindMany,
      visitCreate,
      visitUpdate,
    },
  };
}

// ISO helpers to keep tests readable
const T = (iso: string) => new Date(iso);

describe('visitService.createVisit', () => {
  it('creates a visit and resolves landlordId from the property', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
    });

    const visit = await createVisit(
      {
        propertyId: 'prop-1',
        tenantId: 'tenant-1',
        scheduledAt: T('2026-05-10T14:00:00Z'),
        durationMinutes: 45,
      },
      h.deps,
    );

    expect(visit.landlordId).toBe('landlord-1');
    expect(visit.status).toBe('SCHEDULED');
    expect(h.state.visits).toHaveLength(1);
  });

  it('throws 404 VisitError when property does not exist', async () => {
    const h = makeHarness();

    await expect(
      createVisit(
        {
          propertyId: 'prop-ghost',
          tenantId: 'tenant-1',
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
        },
        h.deps,
      ),
    ).rejects.toMatchObject({
      code: 'PROPERTY_NOT_FOUND',
      httpStatus: 404,
    });
  });

  it('throws 409 when the same property already has an overlapping visit', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-existing',
          propertyId: 'prop-1',
          tenantId: 'tenant-other',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 60,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    // Novo pedido começa 14:30 — sobrepõe com o existente (14:00-15:00)
    await expect(
      createVisit(
        {
          propertyId: 'prop-1',
          tenantId: 'tenant-1',
          scheduledAt: T('2026-05-10T14:30:00Z'),
          durationMinutes: 45,
        },
        h.deps,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      httpStatus: 409,
    });
  });

  it('throws 409 when same landlord has overlapping visit on a DIFFERENT property', async () => {
    const h = makeHarness({
      properties: [
        { id: 'prop-1', landlordId: 'landlord-1' },
        { id: 'prop-2', landlordId: 'landlord-1' },
      ],
      visits: [
        {
          id: 'v-existing',
          propertyId: 'prop-1',
          tenantId: 'tenant-other',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    await expect(
      createVisit(
        {
          propertyId: 'prop-2',
          tenantId: 'tenant-1',
          scheduledAt: T('2026-05-10T14:20:00Z'),
          durationMinutes: 30,
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
  });

  it('does NOT conflict with CANCELLED visits', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-cancelled',
          propertyId: 'prop-1',
          tenantId: 'tenant-other',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 60,
          status: 'CANCELLED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const visit = await createVisit(
      {
        propertyId: 'prop-1',
        tenantId: 'tenant-1',
        scheduledAt: T('2026-05-10T14:30:00Z'),
        durationMinutes: 45,
      },
      h.deps,
    );
    expect(visit.id).toBeDefined();
    expect(h.state.visits.filter((v) => v.status === 'SCHEDULED')).toHaveLength(1);
  });

  it('allows back-to-back visits (end of one == start of next)', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-1',
          propertyId: 'prop-1',
          tenantId: 'tenant-a',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    // 14:45 é exatamente quando o anterior termina — deve permitir
    const visit = await createVisit(
      {
        propertyId: 'prop-1',
        tenantId: 'tenant-b',
        scheduledAt: T('2026-05-10T14:45:00Z'),
        durationMinutes: 45,
      },
      h.deps,
    );
    expect(visit.id).toBeDefined();
  });
});

describe('visitService.getVisitById', () => {
  it('returns the visit when it exists', async () => {
    const existing: FakeVisit = {
      id: 'v-1',
      propertyId: 'p',
      tenantId: 't',
      landlordId: 'l',
      rentalProcessId: null,
      scheduledAt: T('2026-05-10T14:00:00Z'),
      durationMinutes: 45,
      status: 'SCHEDULED',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const h = makeHarness({ visits: [existing] });
    const v = await getVisitById('v-1', h.deps);
    expect(v?.id).toBe('v-1');
  });

  it('returns null when visit not found', async () => {
    const h = makeHarness();
    const v = await getVisitById('nope', h.deps);
    expect(v).toBeNull();
  });
});

describe('visitService.listVisits', () => {
  it('filters by propertyId', async () => {
    const h = makeHarness({
      visits: [
        {
          id: 'v-1',
          propertyId: 'p1',
          tenantId: 't',
          landlordId: 'l',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'v-2',
          propertyId: 'p2',
          tenantId: 't',
          landlordId: 'l',
          rentalProcessId: null,
          scheduledAt: T('2026-05-11T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const list = await listVisits({ propertyId: 'p1' }, h.deps);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('v-1');
  });
});

describe('visitService.updateVisit', () => {
  it('re-validates conflict when scheduledAt changes', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-1',
          propertyId: 'prop-1',
          tenantId: 'ta',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T10:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'v-2',
          propertyId: 'prop-1',
          tenantId: 'tb',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    // Tento remarcar v-1 para 13:45 — sobrepõe com v-2 (14:00-14:45)
    await expect(
      updateVisit('v-1', { scheduledAt: T('2026-05-10T13:45:00Z') }, h.deps),
    ).rejects.toMatchObject({ code: 'CONFLICT', httpStatus: 409 });
  });

  it('updates notes without re-validating when schedule did not change', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-1',
          propertyId: 'prop-1',
          tenantId: 't',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const updated = await updateVisit('v-1', { notes: 'trouxe cão' }, h.deps);
    expect(updated?.notes).toBe('trouxe cão');
  });

  it('returns null when visit does not exist', async () => {
    const h = makeHarness();
    const v = await updateVisit('nope', { notes: 'x' }, h.deps);
    expect(v).toBeNull();
  });
});

describe('visitService.cancelVisit', () => {
  it('sets status to CANCELLED (soft delete)', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-1',
          propertyId: 'prop-1',
          tenantId: 't',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const result = await cancelVisit('v-1', h.deps);
    expect(result).toBe(true);
    expect(h.state.visits[0].status).toBe('CANCELLED');
  });

  it('returns false when visit does not exist', async () => {
    const h = makeHarness();
    const result = await cancelVisit('nope', h.deps);
    expect(result).toBe(false);
  });
});

describe('visitService.listAvailableSlots', () => {
  it('returns slot candidates excluding scheduled visits', async () => {
    const h = makeHarness({
      properties: [{ id: 'prop-1', landlordId: 'landlord-1' }],
      visits: [
        {
          id: 'v-1',
          propertyId: 'prop-1',
          tenantId: 't',
          landlordId: 'landlord-1',
          rentalProcessId: null,
          scheduledAt: T('2026-05-10T14:00:00Z'),
          durationMinutes: 45,
          status: 'SCHEDULED',
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const slots = await listAvailableSlots(
      {
        propertyId: 'prop-1',
        from: T('2026-05-10T13:00:00Z'),
        to: T('2026-05-10T16:00:00Z'),
        slotMinutes: 45,
      },
      h.deps,
    );

    // Deve haver ao menos um slot disponível, e NENHUM deles pode sobrepor 14:00-14:45
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const slotStart = s.startsAt.getTime();
      const slotEnd = slotStart + 45 * 60_000;
      const busyStart = T('2026-05-10T14:00:00Z').getTime();
      const busyEnd = busyStart + 45 * 60_000;
      const overlaps = slotStart < busyEnd && slotEnd > busyStart;
      expect(overlaps).toBe(false);
    }
  });

  it('throws 404 if property not found', async () => {
    const h = makeHarness();
    await expect(
      listAvailableSlots(
        {
          propertyId: 'nope',
          from: T('2026-05-10T13:00:00Z'),
          to: T('2026-05-10T16:00:00Z'),
          slotMinutes: 45,
        },
        h.deps,
      ),
    ).rejects.toMatchObject({ code: 'PROPERTY_NOT_FOUND', httpStatus: 404 });
  });
});

describe('VisitError', () => {
  it('carries code, httpStatus and details', () => {
    const err = new VisitError('CONFLICT', 409, { conflictWith: 'v-1' });
    expect(err.code).toBe('CONFLICT');
    expect(err.httpStatus).toBe(409);
    expect(err.details).toEqual({ conflictWith: 'v-1' });
  });
});
