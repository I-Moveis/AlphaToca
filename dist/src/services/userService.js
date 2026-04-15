"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const db_1 = __importDefault(require("../config/db"));
exports.userService = {
    async getAllUsers() {
        return await db_1.default.user.findMany({
            orderBy: { createdAt: 'desc' }
        });
    },
    async getUserById(id) {
        return await db_1.default.user.findUnique({
            where: { id }
        });
    },
    async createUser(data) {
        return await db_1.default.user.create({
            data
        });
    },
    async updateUser(id, data) {
        try {
            return await db_1.default.user.update({
                where: { id },
                data
            });
        }
        catch (error) {
            return null; // User not found
        }
    },
    async deleteUser(id) {
        try {
            await db_1.default.user.delete({
                where: { id }
            });
            return true;
        }
        catch (error) {
            return false; // User not found
        }
    }
};
