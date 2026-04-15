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
  }
};
