import { Router } from 'express';
import validate from '../../middlewares/validation.js';
import registerSchema from './register.schema.js';
import loginSchema from './login.schema.js';
import AuthController from './controller.js';
import auth from '../../middlewares/auth.js';
import { requireAdmin } from '../../middlewares/permissions.js';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register)
      .post('/login', validate(loginSchema), AuthController.login)
      .post('/refresh', AuthController.refresh)
      .post('/logout', auth, AuthController.logout)
      .delete('/deleteAccount', auth, requireAdmin, AuthController.deleteAccount)
      .post('/otp', AuthController.otp)

export default router;