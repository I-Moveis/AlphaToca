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

  async upsertUserFromAuth0(auth0Data: any): Promise<User> {
    const { sub, name, phone_number } = auth0Data;
    const roles = auth0Data['https://alphatoca.com/roles'] || [];
    
    // Map roles to our enum
    let role: Role = 'TENANT';
    if (roles.includes('ADMIN')) role = 'ADMIN';
    else if (roles.includes('LANDLORD')) role = 'LANDLORD';

    return await prisma.user.upsert({
      where: { id: sub },
      update: {
        name,
        phoneNumber: phone_number,
        role
      },
      create: {
        id: sub,
        name,
        phoneNumber: phone_number,
        role
      }
    });
  }
};
