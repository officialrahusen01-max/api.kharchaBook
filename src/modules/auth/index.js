import { Router } from 'express';
import validate from '../../middlewares/validation.js';
import registerSchema from './register.schema.js';
import loginSchema from './login.schema.js';
import AuthController from './controller.js';
import PasswordRecovery from './passwordRecovery.js';
import createPasswordResetLimiter from '../../middlewares/passwordResetLimiter.js';
import { changePasswordSchema, forgotPasswordSchema, resetPasswordSchema } from './password.schema.js';
import auth from '../../middlewares/auth.js';
import { requireAdmin } from '../../middlewares/permissions.js';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register)
      .post('/login', validate(loginSchema), AuthController.login)
      .post('/forgot-password', createPasswordResetLimiter(), validate(forgotPasswordSchema), PasswordRecovery.forgotPassword)
      .post('/reset-password', createPasswordResetLimiter(), validate(resetPasswordSchema), PasswordRecovery.resetPassword)
      .post('/change-password', auth, validate(changePasswordSchema), PasswordRecovery.changePassword)
      .post('/refresh', AuthController.refresh)
      .post('/logout', auth, AuthController.logout)
      .delete('/deleteAccount', auth, requireAdmin, AuthController.deleteAccount)

export default router;