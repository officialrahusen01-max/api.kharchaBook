import { z } from 'zod';
import { accountTypes, addressSchema, organisationNameSchema } from '../../validators/common.js';

const isValidPastDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return !Number.isNaN(date.valueOf())
        && date.toISOString().slice(0, 10) === value
        && date < today;
};

const profileUpdateSchema = z.object({
    fullName: z.string().trim().min(2).max(100).optional(),
    phoneNumber: z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number.').optional(),
    email: z.string().trim().pipe(z.email().max(254)).transform((value) => value.toLowerCase()).optional(),
    gender: z.string().trim().min(1).max(30).optional(),
    dob: z.string().refine(isValidPastDate, 'Enter a valid past date in YYYY-MM-DD format.').optional(),
    accountType: z.enum(accountTypes).optional(),
    organisationName: organisationNameSchema.optional(),
    address: addressSchema.optional(),
}).strict();

export default profileUpdateSchema;
