import { z } from 'zod';
import {
    accountTypes,
    addressSchema,
    emailSchema,
    organisationNameSchema,
    passwordSchema,
    phoneNumberSchema,
} from '../../validators/common.js';

const isValidPastDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

    const date = new Date(`${value}T00:00:00.000Z`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return !Number.isNaN(date.valueOf())
        && date.toISOString().slice(0, 10) === value
        && date < today;
};

const registerSchema = z.object({
    fullName: z.string().trim().min(2).max(100),
    phoneNumber: phoneNumberSchema,
    email: emailSchema,
    gender: z.string().trim().min(1).max(30),
    dob: z.string().refine(isValidPastDate, 'Enter a valid date of birth in YYYY-MM-DD format.'),
    password: passwordSchema,
    accountType: z.enum(accountTypes),
    organisationName: organisationNameSchema.optional(),
    address: addressSchema,
}).strict().superRefine((value, context) => {
    if (value.accountType === 'business' && !value.organisationName) {
        context.addIssue({
            code: 'custom',
            path: ['organisationName'],
            message: 'Organisation name is required for business accounts.',
        });
    }
    if (value.accountType === 'self' && value.organisationName) {
        context.addIssue({
            code: 'custom',
            path: ['organisationName'],
            message: 'Organisation name can only be set for business accounts.',
        });
    }
});

export default registerSchema;
