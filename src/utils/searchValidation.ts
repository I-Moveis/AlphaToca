import { z } from 'zod';
import { PropertyType } from '@prisma/client';

// Helper para converter texto da URL em número
const stringToNumber = z.string().optional().transform((val) => {
  if (!val) return undefined;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
});

// Helper para converter texto da URL ("true"/"false") em Booleano verdadeiro/falso
const stringToBoolean = z.string().optional().transform((val) => {
  if (val === 'true') return true;
  if (val === 'false') return false;
  return undefined;
});

export const propertySearchSchema = z.object({
  type: z.nativeEnum(PropertyType).optional(),
  minPrice: stringToNumber,
  maxPrice: stringToNumber,
  minBedrooms: stringToNumber,
  minBathrooms: stringToNumber,
  minParkingSpots: stringToNumber,
  minArea: stringToNumber,
  maxArea: stringToNumber,
  isFurnished: stringToBoolean,
  petsAllowed: stringToBoolean,
  nearSubway: stringToBoolean,
  isFeatured: stringToBoolean,

  city: z.string().optional(),
  state: z.string().length(2).toUpperCase().optional(),

  lat: stringToNumber,
  lng: stringToNumber,
  radius: stringToNumber,
  orderBy: z.enum(['createdAt', 'views', 'priceAsc', 'priceDesc', 'isFeatured', 'nearest']).optional().default('isFeatured'),
  page: z.string().optional().default('1').transform((val) => Math.max(1, Number(val))),
  limit: z.string().optional().default('10').transform((val) => Math.min(100, Math.max(1, Number(val)))),
});

export type PropertySearchInput = z.infer<typeof propertySearchSchema>;
