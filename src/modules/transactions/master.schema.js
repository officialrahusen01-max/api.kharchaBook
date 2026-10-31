import { z } from 'zod';

export const createMasterSchema = z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(200).optional(),
}).strict();

export const updateMasterSchema = createMasterSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.',
);
