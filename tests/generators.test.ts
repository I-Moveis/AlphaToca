import { describe, it, expect } from 'vitest';
import { generateUsers, generateProperties, generateChatSessions, generateMessages, generateKnowledgeDocuments } from '../prisma/generators';

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

  describe('generateChatSessions', () => {
    it('should generate chat sessions for tenant IDs', () => {
      const tenantIds = ['t-1', 't-2'];
      const sessions = generateChatSessions(3, tenantIds);
      expect(sessions).toHaveLength(3);
      expect(tenantIds).toContain(sessions[0].tenantId);
      expect(sessions[0]).toHaveProperty('id');
      expect(sessions[0]).toHaveProperty('status');
    });
  });

  describe('generateMessages', () => {
    it('should generate messages for session IDs', () => {
      const sessionIds = ['s-1', 's-2'];
      const messages = generateMessages(10, sessionIds);
      expect(messages).toHaveLength(10);
      expect(sessionIds).toContain(messages[0].sessionId);
      expect(messages[0]).toHaveProperty('id');
      expect(messages[0]).toHaveProperty('content');
      expect(messages[0]).toHaveProperty('senderType');
    });
  });

  describe('generateKnowledgeDocuments', () => {
    it('should generate documents with 1536-dimensional embeddings', () => {
      const docs = generateKnowledgeDocuments(2);
      expect(docs).toHaveLength(2);
      expect(docs[0]).toHaveProperty('id');
      expect(docs[0]).toHaveProperty('title');
      expect(docs[0]).toHaveProperty('content');
      expect(docs[0]).toHaveProperty('embedding');
      expect(docs[0].embedding).toHaveLength(1536);
    });
  });
});
