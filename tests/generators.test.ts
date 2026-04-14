import { describe, it, expect } from 'vitest';
import { generateUsers, generateProperties } from '../prisma/generators';

describe('Data Generators', () => {
  describe('generateUsers', () => {
    it('should generate the specified number of users', () => {
      const users = generateUsers(10);
      expect(users).toHaveLength(10);
    });

    it('should generate valid user objects', () => {
      const [user] = generateUsers(1);
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('phoneNumber');
      expect(user).toHaveProperty('role');
      expect(['TENANT', 'LANDLORD', 'ADMIN']).toContain(user.role);
    });
  });

  describe('generateProperties', () => {
    it('should generate properties associated with landlord IDs', () => {
      const landlordIds = ['id-1', 'id-2'];
      const properties = generateProperties(5, landlordIds);
      expect(properties).toHaveLength(5);
      
      const property = properties[0];
      expect(property).toHaveProperty('id');
      expect(property).toHaveProperty('landlordId');
      expect(landlordIds).toContain(property.landlordId);
      expect(property).toHaveProperty('title');
      expect(property).toHaveProperty('description');
      expect(property).toHaveProperty('price');
      expect(property).toHaveProperty('address');
    });
  });
});
