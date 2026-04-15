"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const userService_1 = require("../services/userService");
exports.userController = {
    async getAll(req, res) {
        const users = await userService_1.userService.getAllUsers();
        return res.status(200).json(users);
    },
    async getById(req, res) {
        const { id } = req.params;
        const user = await userService_1.userService.getUserById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json(user);
    },
    async create(req, res) {
        // Basic validation could be added here
        const { name, phoneNumber, role } = req.body;
        if (!name || !phoneNumber || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const newUser = await userService_1.userService.createUser({ name, phoneNumber, role });
        return res.status(201).json(newUser);
    },
    async update(req, res) {
        const { id } = req.params;
        const user = await userService_1.userService.updateUser(id, req.body);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json(user);
    },
    async delete(req, res) {
        const { id } = req.params;
        const success = await userService_1.userService.deleteUser(id);
        if (!success) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(204).send();
    }
};
