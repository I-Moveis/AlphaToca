import { z } from 'zod';
import { RentalPaymentStatus } from '@prisma/client';

export const updateCurrentPaymentSchema = z.object({
  status: z.nativeEnum(RentalPaymentStatus),
});

export type UpdateCurrentPaymentInput = z.infer<typeof updateCurrentPaymentSchema>;
