import { Role } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

export interface UserMock {
  id: string;
  name: string;
  phoneNumber: string;
  role: Role;
  createdAt: Date;
}

let mockUsers: UserMock[] = [
  {
    id: 'user-1',
    name: 'João da Silva',
    phoneNumber: '+5511999999999',
    role: 'TENANT',
    createdAt: new Date(),
  },
  {
    id: 'user-2',
    name: 'Maria Oliveira',
    phoneNumber: '+5511888888888',
    role: 'LANDLORD',
    createdAt: new Date(),
  }
];

export const userService = {
  async getAllUsers() {
    return mockUsers;
  },

  async getUserById(id: string) {
    return mockUsers.find(u => u.id === id) || null;
  },

  async createUser(data: Omit<UserMock, 'id' | 'createdAt'>) {
    const newUser: UserMock = {
      id: uuidv4(),
      ...data,
      createdAt: new Date()
    };
    mockUsers.push(newUser);
    return newUser;
  },

  async updateUser(id: string, data: Partial<UserMock>) {
    const index = mockUsers.findIndex(u => u.id === id);
    if (index === -1) return null;

    mockUsers[index] = { ...mockUsers[index], ...data };
    return mockUsers[index];
  },

  async deleteUser(id: string) {
    const initialLength = mockUsers.length;
    mockUsers = mockUsers.filter(u => u.id !== id);
    return mockUsers.length < initialLength;
  }
};
