import { Router } from 'express';
import { requireAdmin } from '../../middlewares/permissions.js';
import {
    ExpenseTypeController,
    IncomeTypeController,
    PaymentModeController,
} from './masters.controller.js';

const router = Router();

const masterRoutes = [
    ['/expense-types', ExpenseTypeController],
    ['/income-types', IncomeTypeController],
    ['/payment-modes', PaymentModeController],
];

for (const [path, Controller] of masterRoutes) {
    router.get(path, Controller.list.bind(Controller));
    router.post(path, requireAdmin, Controller.create.bind(Controller));
    router.patch(`${path}/:id`, requireAdmin, Controller.update.bind(Controller));
    router.delete(`${path}/:id`, requireAdmin, Controller.remove.bind(Controller));
}

export default router;
