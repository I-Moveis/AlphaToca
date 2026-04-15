import { Router } from 'express';
import { propertyController } from '../controllers/propertyController';

const router = Router();

router.post('/properties', propertyController.create);
router.get('/properties', propertyController.list);
router.get('/properties/:id', propertyController.getById);
router.put('/properties/:id', propertyController.update);
router.delete('/properties/:id', propertyController.delete);

export default router;
