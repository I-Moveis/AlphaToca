import { z } from 'zod';
import { ModerationStatus, PropertyStatus, Prisma } from '@prisma/client';

const priceField = z.string()
  .regex(/^\d+(\.\d{1,2})?$/, "Price must be a positive number with at most 2 decimal places")
  .transform((val) => new Prisma.Decimal(val));

export const createPropertySchema = z.object({
  landlordId: z.string().uuid({ message: "Invalid landlord ID format" }),
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  price: priceField,
  status: z.nativeEnum(PropertyStatus).optional().default(PropertyStatus.AVAILABLE),
  address: z.string().min(5),
  city: z.string().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  zipCode: z.string().optional(),
});

export const updatePropertySchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().min(10).optional(),
  price: priceField.optional(),
  status: z.nativeEnum(PropertyStatus).optional(),
  address: z.string().min(5).optional(),
  city: z.string().optional(),
  state: z.string().length(2).toUpperCase().optional(),
  zipCode: z.string().optional(),
});

// Somente APPROVED ou REJECTED são decisões válidas — PENDING é default no insert
// e não faz sentido como alvo de moderação (reverteria o status para "não avaliado").
export const moderatePropertySchema = z
  .object({
    decision: z.enum([ModerationStatus.APPROVED, ModerationStatus.REJECTED]),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .refine((val) => val.decision !== ModerationStatus.REJECTED || !!val.reason, {
    message: 'reason is required when decision is REJECTED',
    path: ['reason'],
  });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type ModeratePropertyInput = z.infer<typeof moderatePropertySchema>;