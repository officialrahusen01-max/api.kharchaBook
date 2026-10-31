import { Router } from 'express';
import authenticate from '../../middlewares/auth.js';
import masterRoutes from './masterRoutes.js';
import TransactionController from './controller.js';

const router = Router();

router.use(authenticate, masterRoutes);
router.get('/summary', TransactionController.summary);
router.route('/')
    .get(TransactionController.list)
    .post(TransactionController.create);
router.route('/:id')
    .patch(TransactionController.update)
    .delete(TransactionController.remove);

export default router;