import { PropertyStatus } from '@prisma/client';

export interface PropertyMock {
  id: string;
  landlordId: string;
  title: string;
  description: string;
  price: number;
  status: PropertyStatus;
  address: string;
}

let mockProperties: PropertyMock[] = [
  {
    id: '1',
    landlordId: 'user-1',
    title: 'Apartamento aconchegante',
    description: 'Um belo apartamento no centro.',
    price: 1500,
    status: 'AVAILABLE',
    address: 'Rua das Flores, 123'
  }
];

export const propertyService = {
  async updateProperty(id: string, data: Partial<PropertyMock>) {
    const index = mockProperties.findIndex(p => p.id === id);
    if (index === -1) return null;

    mockProperties[index] = { ...mockProperties[index], ...data };
    return mockProperties[index];
  },

  async deleteProperty(id: string) {
    const initialLength = mockProperties.length;
    mockProperties = mockProperties.filter(p => p.id !== id);
    return mockProperties.length < initialLength;
  }
};
