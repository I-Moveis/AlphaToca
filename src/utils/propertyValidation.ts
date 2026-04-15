import { z } from 'zod';
import { PropertyStatus } from '@prisma/client';

export const createPropertySchema = z.object({
  landlordId: z.string().uuid({ message: "Invalid landlord ID format" }),
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  price: z.number().positive(),
  status: z.nativeEnum(PropertyStatus).optional().default(PropertyStatus.AVAILABLE),
  address: z.string().min(5),
});

export const updatePropertySchema = createPropertySchema.partial().omit({ landlordId: true });

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
