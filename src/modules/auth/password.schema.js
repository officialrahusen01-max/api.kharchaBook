import { z } from 'zod';
import { emailSchema, passwordSchema } from '../../validators/common.js';

export const forgotPasswordSchema = z.object({
    email: emailSchema,
}).strict();

export const resetPasswordSchema = z.object({
    email: emailSchema,
    otp: z.string().trim().regex(/^\d{6}$/, 'OTP must be exactly 6 digits.'),
    newPassword: passwordSchema,
}).strict();

export const changePasswordSchema = z.object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
}).strict().refine(
    ({ currentPassword, newPassword }) => currentPassword !== newPassword,
    { path: ['newPassword'], message: 'New password must be different from the current password.' },
);
