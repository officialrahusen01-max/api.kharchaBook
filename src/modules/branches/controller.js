import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import User from '../users/model.js';
import Transaction from '../transactions/model.js';
import RefreshToken from '../auth/refreshToken.model.js';
import { hashPassword } from '../auth/password.js';
import Branch from './model.js';
import { branchToResponse, createBranchSchema, updateBranchSchema } from './branch.schema.js';
import { getDefaultBranchId, isAdmin } from './service.js';

const getIssues = (error) => error.issues.map(({ path, code, message }) => ({
    path,
    code,
    message,
}));

const parseOrThrow = (schema, value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new ApiError(400, 'Invalid branch data.', getIssues(parsed.error));
    }
    return parsed.data;
};

const assertValidId = (id) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'Invalid branch ID.');
    }
};

// Admins reach every branch of the account; branch users only their own.
const findAccessibleBranch = async (req) => {
    assertValidId(req.params.id);
    if (!isAdmin(req.user) && req.params.id !== req.user.branchId) {
        throw new ApiError(403, 'You can only manage your own branch.');
    }
    const branch = await Branch.findOne({ _id: req.params.id, userId: req.user.id });
    if (!branch) {
        throw new ApiError(404, 'Branch was not found.');
    }
    return branch;
};

const assertAnotherAdminExists = async (branch) => {
    const otherAdmin = await Branch.exists({
        userId: branch.userId,
        role: 'admin',
        _id: { $ne: branch._id },
    });
    if (!otherAdmin) {
        throw new ApiError(409, 'An account must keep at least one admin branch.');
    }
};

class BranchController {
    static async list(req, res) {
        const filter = { userId: req.user.id };
        if (!isAdmin(req.user)) {
            filter._id = req.user.branchId;
        }
        const [defaultBranchId, branches] = await Promise.all([
            getDefaultBranchId(req.user.id),
            Branch.find(filter).sort({ createdAt: 1 }),
        ]);
        res.status(200).json(new ApiResponse(
            200,
            branches.map((branch) => branchToResponse(branch, defaultBranchId)),
            'Branch list retrieved successfully',
        ));
    }

    static async create(req, res) {
        const { password, ...data } = parseOrThrow(createBranchSchema, req.body);
        const defaultBranchId = await getDefaultBranchId(req.user.id);
        const branch = await Branch.create({
            ...data,
            passwordHash: await hashPassword(password),
            userId: req.user.id,
        });
        res.status(201).json(new ApiResponse(
            201,
            branchToResponse(branch, defaultBranchId),
            'Branch created successfully',
        ));
    }

    static async update(req, res) {
        const { password, ...updates } = parseOrThrow(updateBranchSchema, req.body);
        const branch = await findAccessibleBranch(req);

        if (updates.role && !isAdmin(req.user)) {
            throw new ApiError(403, 'Only an admin can change branch roles.');
        }
        if (updates.role === 'user' && branch.role === 'admin') {
            await assertAnotherAdminExists(branch);
        }

        Object.assign(branch, updates);
        if (password) {
            branch.passwordHash = await hashPassword(password);
        }
        await branch.save();
        if (password || updates.role) {
            await RefreshToken.deleteMany({ branchId: branch._id });
        }

        const defaultBranchId = await getDefaultBranchId(req.user.id);
        res.status(200).json(new ApiResponse(
            200,
            branchToResponse(branch, defaultBranchId),
            'Branch updated successfully',
        ));
    }

    static async setDefault(req, res) {
        const branch = await findAccessibleBranch(req);
        await User.updateOne({ _id: req.user.id }, { $set: { defaultBranchId: branch._id } });
        res.status(200).json(new ApiResponse(
            200,
            branchToResponse(branch, branch._id),
            'Default branch updated successfully',
        ));
    }

    static async remove(req, res) {
        const branch = await findAccessibleBranch(req);

        const defaultBranchId = await getDefaultBranchId(req.user.id);
        if (branch.id === defaultBranchId) {
            throw new ApiError(409, 'The default branch cannot be deleted. Set another branch as default first.');
        }
        if (branch.role === 'admin') {
            await assertAnotherAdminExists(branch);
        }

        const isInUse = await Transaction.exists({ userId: req.user.id, branchId: branch._id });
        if (isInUse) {
            throw new ApiError(409, 'This branch has transactions and cannot be deleted.');
        }

        await Promise.all([
            branch.deleteOne(),
            RefreshToken.deleteMany({ branchId: branch._id }),
        ]);
        res.status(200).json(new ApiResponse(200, {}, 'Branch deleted successfully'));
    }
}

export default BranchController;
