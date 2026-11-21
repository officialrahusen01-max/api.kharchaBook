import { Router } from 'express';
import authenticate from '../../middlewares/auth.js';
import NotificationController from './controller.js';

const router = Router();

router.use(authenticate);
const deviceRoutes = Router();
deviceRoutes.route('/')
    .get(NotificationController.listDevices)
    .post(NotificationController.registerDevice);
deviceRoutes.delete('/:id', NotificationController.removeDevice);

const reminderRoutes = Router();
reminderRoutes.route('/')
    .get(NotificationController.listReminders)
    .post(NotificationController.createReminder);
reminderRoutes.route('/:id')
    .patch(NotificationController.updateReminder)
    .delete(NotificationController.removeReminder);

router.use('/devices', deviceRoutes);
router.use('/reminders', reminderRoutes);

export default router;
