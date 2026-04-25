import { describe, it, expect } from 'vitest';
import {
  createVisitSchema,
  updateVisitSchema,
  listVisitsQuerySchema,
  availabilityQuerySchema,
} from '../src/utils/visitValidation';

describe('createVisitSchema', () => {
  it('accepts a valid minimal payload and defaults durationMinutes to 45', () => {
    const parsed = createVisitSchema.parse({
      propertyId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      scheduledAt: '2026-05-10T14:00:00Z',
    });
    expect(parsed.durationMinutes).toBe(45);
    expect(parsed.scheduledAt).toBeInstanceOf(Date);
  });

  it('rejects non-uuid propertyId', () => {
    expect(() =>
      createVisitSchema.parse({
        propertyId: 'not-a-uuid',
        tenantId: '22222222-2222-2222-2222-222222222222',
        scheduledAt: '2026-05-10T14:00:00Z',
      }),
    ).toThrow();
  });

  it('rejects invalid scheduledAt (exercises errorMap)', () => {
    expect(() =>
      createVisitSchema.parse({
        propertyId: '11111111-1111-1111-1111-111111111111',
        tenantId: '22222222-2222-2222-2222-222222222222',
        scheduledAt: 'not-a-date',
      }),
    ).toThrow(/scheduledAt must be a valid ISO-8601 datetime/);
  });

  it('rejects durationMinutes below 15 or above 180', () => {
    const base = {
      propertyId: '11111111-1111-1111-1111-111111111111',
      tenantId: '22222222-2222-2222-2222-222222222222',
      scheduledAt: '2026-05-10T14:00:00Z',
    };
    expect(() => createVisitSchema.parse({ ...base, durationMinutes: 10 })).toThrow();
    expect(() => createVisitSchema.parse({ ...base, durationMinutes: 200 })).toThrow();
  });
});

describe('updateVisitSchema', () => {
  it('requires at least one field', () => {
    expect(() => updateVisitSchema.parse({})).toThrow();
  });

  it('accepts partial updates', () => {
    const parsed = updateVisitSchema.parse({ notes: 'trouxe documento' });
    expect(parsed.notes).toBe('trouxe documento');
  });

  it('accepts status transitions', () => {
    const parsed = updateVisitSchema.parse({ status: 'COMPLETED' });
    expect(parsed.status).toBe('COMPLETED');
  });
});

describe('listVisitsQuerySchema', () => {
  it('accepts empty query', () => {
    const parsed = listVisitsQuerySchema.parse({});
    expect(parsed).toEqual({});
  });

  it('coerces from/to to Date', () => {
    const parsed = listVisitsQuerySchema.parse({
      from: '2026-05-10T00:00:00Z',
      to: '2026-05-11T00:00:00Z',
    });
    expect(parsed.from).toBeInstanceOf(Date);
    expect(parsed.to).toBeInstanceOf(Date);
  });
});

describe('availabilityQuerySchema', () => {
  it('requires propertyId, from, to', () => {
    expect(() => availabilityQuerySchema.parse({})).toThrow();
  });

  it('defaults slotMinutes to 45', () => {
    const parsed = availabilityQuerySchema.parse({
      propertyId: '11111111-1111-1111-1111-111111111111',
      from: '2026-05-10T13:00:00Z',
      to: '2026-05-10T16:00:00Z',
    });
    expect(parsed.slotMinutes).toBe(45);
  });
});
