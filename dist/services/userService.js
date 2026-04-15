"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const uuid_1 = require("uuid");
let mockUsers = [
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
exports.userService = {
    async getAllUsers() {
        return mockUsers;
    },
    async getUserById(id) {
        return mockUsers.find(u => u.id === id) || null;
    },
    async createUser(data) {
        const newUser = {
            id: (0, uuid_1.v4)(),
            ...data,
            createdAt: new Date()
        };
        mockUsers.push(newUser);
        return newUser;
    },
    async updateUser(id, data) {
        const index = mockUsers.findIndex(u => u.id === id);
        if (index === -1)
            return null;
        mockUsers[index] = { ...mockUsers[index], ...data };
        return mockUsers[index];
    },
    async deleteUser(id) {
        const initialLength = mockUsers.length;
        mockUsers = mockUsers.filter(u => u.id !== id);
        return mockUsers.length < initialLength;
    }
};
