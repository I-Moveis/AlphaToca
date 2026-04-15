"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateKnowledgeDocuments = exports.generateMessages = exports.generateChatSessions = exports.generateProperties = exports.generateUsers = void 0;
const faker_1 = require("@faker-js/faker");
const generateUsers = (count) => {
    return Array.from({ length: count }).map(() => ({
        id: faker_1.faker.string.uuid(),
        name: faker_1.faker.person.fullName(),
        phoneNumber: faker_1.faker.phone.number(),
        role: faker_1.faker.helpers.arrayElement(['TENANT', 'LANDLORD', 'ADMIN']),
        createdAt: faker_1.faker.date.past(),
    }));
};
exports.generateUsers = generateUsers;
const generateProperties = (count, landlordIds) => {
    return Array.from({ length: count }).map(() => ({
        id: faker_1.faker.string.uuid(),
        landlordId: faker_1.faker.helpers.arrayElement(landlordIds),
        title: faker_1.faker.lorem.words(3),
        description: faker_1.faker.lorem.paragraph(),
        price: faker_1.faker.number.float({ min: 500, max: 5000, fractionDigits: 2 }),
        status: faker_1.faker.helpers.arrayElement(['AVAILABLE', 'IN_NEGOTIATION', 'RENTED']),
        address: faker_1.faker.location.streetAddress(),
    }));
};
exports.generateProperties = generateProperties;
const generateChatSessions = (count, tenantIds) => {
    return Array.from({ length: count }).map(() => ({
        id: faker_1.faker.string.uuid(),
        tenantId: faker_1.faker.helpers.arrayElement(tenantIds),
        status: faker_1.faker.helpers.arrayElement(['ACTIVE_BOT', 'WAITING_HUMAN', 'RESOLVED']),
        startedAt: faker_1.faker.date.past(),
    }));
};
exports.generateChatSessions = generateChatSessions;
const generateMessages = (count, sessionIds) => {
    return Array.from({ length: count }).map(() => ({
        id: faker_1.faker.string.uuid(),
        sessionId: faker_1.faker.helpers.arrayElement(sessionIds),
        senderType: faker_1.faker.helpers.arrayElement(['BOT', 'TENANT', 'LANDLORD']),
        content: faker_1.faker.lorem.sentence(),
        mediaUrl: faker_1.faker.datatype.boolean() ? faker_1.faker.image.url() : null,
        timestamp: faker_1.faker.date.recent(),
    }));
};
exports.generateMessages = generateMessages;
const generateKnowledgeDocuments = (count) => {
    return Array.from({ length: count }).map(() => ({
        id: faker_1.faker.string.uuid(),
        title: faker_1.faker.lorem.words(4),
        content: faker_1.faker.lorem.paragraphs(2),
        embedding: Array.from({ length: 1536 }).map(() => faker_1.faker.number.float({ min: -1, max: 1 })),
    }));
};
exports.generateKnowledgeDocuments = generateKnowledgeDocuments;
