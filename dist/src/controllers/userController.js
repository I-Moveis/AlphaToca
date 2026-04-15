"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
const userService_1 = require("../services/userService");
const userValidation_1 = require("../utils/userValidation");
exports.userController = {
    async getAll(req, res, next) {
        try {
            const users = await userService_1.userService.getAllUsers();
            return res.status(200).json(users);
        }
        catch (error) {
            next(error);
        }
    },
    async getById(req, res, next) {
        try {
            const { id } = req.params;
            const user = await userService_1.userService.getUserById(id);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.status(200).json(user);
        }
        catch (error) {
            next(error);
        }
    },
    async create(req, res, next) {
        try {
            const validatedData = userValidation_1.UserSchema.parse(req.body);
            const newUser = await userService_1.userService.createUser(validatedData);
            return res.status(201).json(newUser);
        }
        catch (error) {
            next(error);
        }
    },
    async update(req, res, next) {
        try {
            const { id } = req.params;
            const validatedData = userValidation_1.UserUpdateSchema.parse(req.body);
            const user = await userService_1.userService.updateUser(id, validatedData);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.status(200).json(user);
        }
        catch (error) {
            next(error);
        }
    },
    async delete(req, res, next) {
        try {
            const { id } = req.params;
            const success = await userService_1.userService.deleteUser(id);
            if (!success) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.status(204).send();
        }
        catch (error) {
            next(error);
        }
    }
};
