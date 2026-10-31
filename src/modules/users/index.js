import { Router } from 'express';
import authenticate from '../../middlewares/auth.js';
import { requireAdmin } from '../../middlewares/permissions.js';
import UserController from './controller.js';
import { parseProfilePhoto } from './profilePhoto.js';

const router = Router();

router.use(authenticate)
    .get('/profile', UserController.getProfile)
    .put('/profile', requireAdmin, UserController.updateProfile)
    .patch('/profile/photo', requireAdmin, parseProfilePhoto, UserController.updateProfilePhoto)

export default router;
