import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import User from '../users/model.js';
import Transaction from '../transactions/model.js';
import Loan from '../loan/model.js';
import RefreshToken from '../auth/refreshToken.model.js';
import Branch from './model.js';
import { ExpenseType, IncomeType, PaymentMode } from '../transactions/masters.model.js';
import { branchToResponse, createBranchSchema, updateBranchSchema } from './branch.schema.js';
import { getDefaultBranchId, isAdmin } from './service.js';
import FcmDevice from '../notifications/device.model.js';
import Reminder from '../notifications/reminder.model.js';

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

// Account owners may manage branches; legacy branch-user tokens are restricted to their branch.
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
        const data = parseOrThrow(createBranchSchema, req.body);
        const defaultBranchId = await getDefaultBranchId(req.user.id);
        const branch = await Branch.create({
            ...data,
            userId: req.user.id,
        });
        res.status(201).json(new ApiResponse(
            201,
            branchToResponse(branch, defaultBranchId),
            'Branch created successfully',
        ));
    }

    static async update(req, res) {
        const updates = parseOrThrow(updateBranchSchema, req.body);
        const branch = await findAccessibleBranch(req);
        Object.assign(branch, updates);
        await branch.save();

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
        const [hasTransactions, hasLoans, hasExpenseTypes, hasIncomeTypes, hasPaymentModes] = await Promise.all([
            Transaction.exists({ userId: req.user.id, branchId: branch._id }),
            Loan.exists({ userId: req.user.id, branchId: branch._id }),
            ExpenseType.exists({ userId: req.user.id, branchId: branch._id }),
            IncomeType.exists({ userId: req.user.id, branchId: branch._id }),
            PaymentMode.exists({ userId: req.user.id, branchId: branch._id }),
        ]);
        const isInUse = hasTransactions || hasLoans || hasExpenseTypes || hasIncomeTypes || hasPaymentModes;
        if (isInUse) {
            throw new ApiError(409, 'This branch has finance records and cannot be deleted.');
        }

        await Promise.all([
            branch.deleteOne(),
            RefreshToken.deleteMany({ branchId: branch._id }),
            FcmDevice.deleteMany({ userId: req.user.id, branchId: branch._id }),
            Reminder.deleteMany({ userId: req.user.id, branchId: branch._id }),
            User.deleteMany({ ownerUserId: req.user.id, branchId: branch._id, role: 'user' }),
        ]);
        res.status(200).json(new ApiResponse(200, {}, 'Branch deleted successfully'));
    }
}

export default BranchController;
