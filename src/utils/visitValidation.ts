import { z } from 'zod';
import { VisitStatus } from '@prisma/client';
import {
  DEFAULT_VISIT_DURATION_MINUTES,
  MAX_VISIT_DURATION_MINUTES,
  MIN_VISIT_DURATION_MINUTES,
} from '../config/visits';

const scheduledAtField = z.coerce.date({
  errorMap: () => ({ message: 'scheduledAt must be a valid ISO-8601 datetime' }),
});

const durationMinutesField = z
  .number()
  .int()
  .min(MIN_VISIT_DURATION_MINUTES, `durationMinutes must be at least ${MIN_VISIT_DURATION_MINUTES}`)
  .max(MAX_VISIT_DURATION_MINUTES, `durationMinutes must be at most ${MAX_VISIT_DURATION_MINUTES}`);

export const createVisitSchema = z.object({
  propertyId: z.string().uuid({ message: 'Invalid propertyId format' }),
  tenantId: z.string().uuid({ message: 'Invalid tenantId format' }),
  rentalProcessId: z.string().uuid({ message: 'Invalid rentalProcessId format' }).optional(),
  scheduledAt: scheduledAtField,
  durationMinutes: durationMinutesField.optional().default(DEFAULT_VISIT_DURATION_MINUTES),
  notes: z.string().max(2000).optional(),
});

export const updateVisitSchema = z
  .object({
    scheduledAt: scheduledAtField.optional(),
    durationMinutes: durationMinutesField.optional(),
    status: z.nativeEnum(VisitStatus).optional(),
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided for update',
  });

export const listVisitsQuerySchema = z.object({
  propertyId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  landlordId: z.string().uuid().optional(),
  status: z.nativeEnum(VisitStatus).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const availabilityQuerySchema = z.object({
  propertyId: z.string().uuid({ message: 'propertyId is required' }),
  from: z.coerce.date(),
  to: z.coerce.date(),
  slotMinutes: z.coerce
    .number()
    .int()
    .min(MIN_VISIT_DURATION_MINUTES)
    .max(MAX_VISIT_DURATION_MINUTES)
    .optional()
    .default(DEFAULT_VISIT_DURATION_MINUTES),
});

export type CreateVisitInput = z.infer<typeof createVisitSchema>;
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;
export type ListVisitsQuery = z.infer<typeof listVisitsQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
