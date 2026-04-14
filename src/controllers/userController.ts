import { Request, Response } from 'express';
import { userService } from '../services/userService';

export const userController = {
  async getAll(req: Request, res: Response) {
    const users = await userService.getAllUsers();
    return res.status(200).json(users);
  },

  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const user = await userService.getUserById(id);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  },

  async create(req: Request, res: Response) {
    // Basic validation could be added here
    const { name, phoneNumber, role } = req.body;
    
    if (!name || !phoneNumber || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newUser = await userService.createUser({ name, phoneNumber, role });
    return res.status(201).json(newUser);
  },

  async update(req: Request, res: Response) {
    const { id } = req.params;
    const user = await userService.updateUser(id, req.body);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json(user);
  },

  async delete(req: Request, res: Response) {
    const { id } = req.params;
    const success = await userService.deleteUser(id);

    if (!success) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(204).send();
  }
};
