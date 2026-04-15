import { z } from 'zod';
import { Role } from '@prisma/client';

export const UserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
  role: z.nativeEnum(Role).default(Role.TENANT),
});

export const UserUpdateSchema = UserSchema.partial();

export type UserInput = z.infer<typeof UserSchema>;
export type UserUpdateInput = z.infer<typeof UserUpdateSchema>;
