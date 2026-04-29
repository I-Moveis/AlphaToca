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

  async updateUser(id: string, data: Partial<{ name: string; phoneNumber: string; role: Role; fcmToken: string }>): Promise<User | null> {
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
   * If the user exists, updates their profile data — but only updates role
   * when the token actually carries a roles claim, to avoid downgrading an
   * existing user on a token that lacks the custom claim.
   */
  async upsertUserFromAuth0(auth0Payload: Record<string, unknown>): Promise<User> {
    const sub = auth0Payload.sub;
    if (typeof sub !== 'string' || sub.length === 0) {
      throw new Error('Auth0 payload is missing the "sub" claim.');
    }

    const name = (auth0Payload.name as string) || 'Unknown';
    const phoneNumber = auth0Payload.phone_number as string | undefined;
    const rolesClaim = auth0Payload['https://alphatoca.com/roles'];
    const roles = Array.isArray(rolesClaim)
      ? rolesClaim.map((r) => String(r).toUpperCase())
      : null;

    // Map Auth0 roles to our enum. Only derive a role when the claim is present.
    let mappedRole: Role | undefined;
    if (roles) {
      if (roles.includes('ADMIN')) mappedRole = 'ADMIN';
      else if (roles.includes('LANDLORD')) mappedRole = 'LANDLORD';
      else mappedRole = 'TENANT';
    }

    // phoneNumber is @unique in the schema, so a shared "pending" placeholder
    // would collide for the second user without a phone claim. Scope it per sub.
    const placeholderPhone = `pending:${sub}`;

    return await prisma.user.upsert({
      where: { auth0Sub: sub },
      update: {
        name,
        ...(phoneNumber && { phoneNumber }),
        ...(mappedRole && { role: mappedRole })
      },
      create: {
        auth0Sub: sub,
        name,
        phoneNumber: phoneNumber || placeholderPhone,
        role: mappedRole ?? 'TENANT'
      }
    });
  }
};
