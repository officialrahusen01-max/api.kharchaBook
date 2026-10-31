import { Router } from 'express';
import authenticate from '../../middlewares/auth.js';
import { requireAdmin } from '../../middlewares/permissions.js';
import BranchController from './controller.js';

const router = Router();

router.use(authenticate);
router.route('/')
    .get(BranchController.list)
    .post(requireAdmin, BranchController.create);
router.route('/:id')
    .patch(BranchController.update)
    .delete(requireAdmin, BranchController.remove);
router.patch('/:id/default', requireAdmin, BranchController.setDefault);

export default router;
