import { Router } from 'express';
import { propertyController } from '../controllers/propertyController';

const router = Router();

router.put('/properties/:id', propertyController.update);

router.delete('/properties/:id', propertyController.delete);

export default router;
