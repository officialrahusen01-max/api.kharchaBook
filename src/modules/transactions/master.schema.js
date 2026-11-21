import { z } from 'zod';

const masterFieldsSchema = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200).optional(),
}).strict();

export const createMasterSchema = masterFieldsSchema.extend({
    branchId: z.string().regex(/^[\da-f]{24}$/i, 'Invalid branch ID.').optional(),
});

export const updateMasterSchema = masterFieldsSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.',
);

export const masterQuerySchema = z.object({
    branchId: z.string().regex(/^[\da-f]{24}$/i, 'Invalid branch ID.').optional(),
}).strict();
