import { Router } from 'express';
import { proposalController } from '../controllers/proposalController';

const router = Router();

router.post('/proposals', proposalController.create);
router.get('/proposals', proposalController.list);
router.get('/proposals/:id', proposalController.getById);
router.patch('/proposals/:id/status', proposalController.updateStatus);

export default router;
