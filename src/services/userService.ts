import { Role, User } from '@prisma/client';
import prisma from '../config/db';

export const userService = {
  async getAllUsers(): Promise<User[]> {
    return await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
  },

  async getUserById(id: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { id }
    });
  },

  async getUserByAuth0Sub(auth0Sub: string): Promise<User | null> {
    return await prisma.user.findUnique({
      where: { auth0Sub }
    });
  },

  async createUser(data: { name: string; phoneNumber: string; role: Role }): Promise<User> {
    return await prisma.user.create({
      data
    });
  },

  async updateUser(id: string, data: Partial<{ name: string; phoneNumber: string; role: Role }>): Promise<User | null> {
    try {
      return await prisma.user.update({
        where: { id },
        data
      });
    } catch (error) {
      return null; // User not found
    }
  },

  async deleteUser(id: string): Promise<boolean> {
    try {
      await prisma.user.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      return false; // User not found
    }
  },

  /**
   * Upsert a user from Auth0 JWT payload.
   * Uses auth0Sub (the "sub" claim) as the unique identifier for sync.
   * If the user doesn't exist, creates a new one with a UUID id.
   * If the user exists, updates their profile data.
   */
  async upsertUserFromAuth0(auth0Payload: Record<string, unknown>): Promise<User> {
    const sub = auth0Payload.sub as string;
    const name = (auth0Payload.name as string) || 'Unknown';
    const phoneNumber = auth0Payload.phone_number as string | undefined;
    const roles = (auth0Payload['https://alphatoca.com/roles'] as string[]) || [];

    // Map Auth0 roles to our enum
    let role: Role = 'TENANT';
    if (roles.includes('ADMIN')) role = 'ADMIN';
    else if (roles.includes('LANDLORD')) role = 'LANDLORD';

    return await prisma.user.upsert({
      where: { auth0Sub: sub },
      update: {
        name,
        ...(phoneNumber && { phoneNumber }),
        role
      },
      create: {
        auth0Sub: sub,
        name,
        phoneNumber: phoneNumber || 'pending',
        role
      }
    });
  }
};
