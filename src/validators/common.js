import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[\da-f]{24}$/i, 'Invalid ID.');

export const phoneNumberSchema = z.string().trim().regex(/^\+?[1-9]\d{6,14}$/, 'Enter a valid phone number.');

export const emailSchema = z.string().trim().pipe(z.email().max(254)).transform((value) => value.toLowerCase());

export const addressSchema = z.object({
    line1: z.string().trim().min(1).max(200),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    pincode: z.string().trim().regex(/^[A-Za-z0-9 -]{3,10}$/, 'Enter a valid pincode.'),
    country: z.string().trim().min(1).max(80).optional(),
}).strict();

export const passwordSchema = z.string().regex(/^[0-9]{4}$/, 'Password must be exactly 4 digits.');

export const accountTypes = ['self', 'business'];

export const branchRoles = ['admin', 'user'];

export const organisationNameSchema = z.string().trim().min(2).max(120);

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});
