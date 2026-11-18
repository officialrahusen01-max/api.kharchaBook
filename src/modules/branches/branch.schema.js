import { z } from 'zod';
import {
    addressSchema,
} from '../../validators/common.js';

export const createBranchSchema = z.object({
    name: z.string().trim().min(1).max(80),
    address: addressSchema,
}).strict();

export const updateBranchSchema = createBranchSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.',
);

export const branchToResponse = (branch, defaultBranchId) => ({
    id: branch.id,
    name: branch.name,
    address: branch.address ?? null,
    isDefault: String(branch._id ?? branch.id) === String(defaultBranchId),
    createdAt: branch.createdAt,
    updatedAt: branch.updatedAt,
});
