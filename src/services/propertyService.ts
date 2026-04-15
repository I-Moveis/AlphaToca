import prisma from '../config/prisma';
import { Property, PropertyStatus } from '@prisma/client';
import { CreatePropertyInput, UpdatePropertyInput } from '../utils/propertyValidation';

export const propertyService = {
  async createProperty(data: CreatePropertyInput): Promise<Property> {
    return prisma.property.create({
      data,
    });
  },

  async listProperties(): Promise<Property[]> {
    return prisma.property.findMany({
      orderBy: { id: 'asc' },
    });
  },

  async getPropertyById(id: string): Promise<Property | null> {
    return prisma.property.findUnique({
      where: { id },
    });
  },

  async updateProperty(id: string, data: UpdatePropertyInput): Promise<Property | null> {
    const exists = await prisma.property.findUnique({ where: { id } });
    if (!exists) return null;

    return prisma.property.update({
      where: { id },
      data,
    });
  },

  async deleteProperty(id: string): Promise<boolean> {
    try {
      await prisma.property.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
};
