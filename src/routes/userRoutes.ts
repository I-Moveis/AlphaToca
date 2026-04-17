import { Router } from 'express';
import { userController } from '../controllers/userController';

const router = Router();

// Authenticated user's own profile (must be before :id to avoid conflict)
router.get('/users/me', userController.getMe);

router.get('/users', userController.getAll);
router.get('/users/:id', userController.getById);
router.post('/users', userController.create);
router.put('/users/:id', userController.update);
router.delete('/users/:id', userController.delete);

export default router;
