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
