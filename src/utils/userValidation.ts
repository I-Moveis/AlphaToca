import { z } from 'zod';
import { Role } from '@prisma/client';

export const UserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format"),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
  role: z.nativeEnum(Role).default(Role.TENANT),
  fcmToken: z.string().optional(),
});

export const UserUpdateSchema = UserSchema.partial();

export const UserUpdateMeSchema = z.object({
  phoneNumber: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format")
    .optional(),
  role: z.enum(['TENANT', 'LANDLORD']).optional(),
});

export type UserInput = z.infer<typeof UserSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
export type UserUpdateMeInput = z.infer<typeof UserUpdateMeSchema>;
