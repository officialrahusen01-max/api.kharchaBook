import { z } from 'zod';
import { passwordSchema, phoneNumberSchema } from '../../validators/common.js';

const loginSchema = z.object({
    phoneNumber: phoneNumberSchema,
    password: passwordSchema,
}).strict();

export default loginSchema;
