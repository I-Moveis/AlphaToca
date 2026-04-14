import { faker } from '@faker-js/faker';

export const generateUsers = (count: number) => {
  return Array.from({ length: count }).map(() => ({
    id: faker.string.uuid(),
    name: faker.person.fullName(),
    phoneNumber: faker.phone.number(),
    role: faker.helpers.arrayElement(['TENANT', 'LANDLORD', 'ADMIN']),
    createdAt: faker.date.past(),
  }));
};

export const generateProperties = (count: number, landlordIds: string[]) => {
  return Array.from({ length: count }).map(() => ({
    id: faker.string.uuid(),
    landlordId: faker.helpers.arrayElement(landlordIds),
    title: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    price: faker.number.float({ min: 500, max: 5000, fractionDigits: 2 }),
    status: faker.helpers.arrayElement(['AVAILABLE', 'IN_NEGOTIATION', 'RENTED']),
    address: faker.location.streetAddress(),
  }));
};

export const generateChatSessions = (count: number, tenantIds: string[]) => {
  return Array.from({ length: count }).map(() => ({
    id: faker.string.uuid(),
    tenantId: faker.helpers.arrayElement(tenantIds),
    status: faker.helpers.arrayElement(['ACTIVE_BOT', 'WAITING_HUMAN', 'RESOLVED']),
    startedAt: faker.date.past(),
  }));
};

export const generateMessages = (count: number, sessionIds: string[]) => {
  return Array.from({ length: count }).map(() => ({
    id: faker.string.uuid(),
    sessionId: faker.helpers.arrayElement(sessionIds),
    senderType: faker.helpers.arrayElement(['BOT', 'TENANT', 'LANDLORD']),
    content: faker.lorem.sentence(),
    mediaUrl: faker.datatype.boolean() ? faker.image.url() : null,
    timestamp: faker.date.recent(),
  }));
};

export const generateKnowledgeDocuments = (count: number) => {
  return Array.from({ length: count }).map(() => ({
    id: faker.string.uuid(),
    title: faker.lorem.words(4),
    content: faker.lorem.paragraphs(2),
    embedding: Array.from({ length: 1536 }).map(() => faker.number.float({ min: -1, max: 1 })),
  }));
};

