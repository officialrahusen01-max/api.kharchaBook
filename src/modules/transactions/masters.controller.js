import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { ExpenseType, IncomeType, PaymentMode } from './masters.model.js';
import Transaction from './model.js';
import { createMasterSchema, masterQuerySchema, updateMasterSchema } from './master.schema.js';
import { isAdmin, resolveBranchId } from '../branches/service.js';

const getIssues = (error) => error.issues.map(({ path, code, message }) => ({
    path,
    code,
    message,
}));

class MasterController {
    static async list(req, res) {
        const parsed = masterQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            throw new ApiError(400, 'Invalid master filter.', getIssues(parsed.error));
        }
        const branchId = await resolveBranchId(req.user, parsed.data.branchId);
        const records = await this.Model.find({ userId: req.user.id, branchId }).sort({ name: 1 });
        res.status(200).json(new ApiResponse(
            200,
            records,
            `${this.label} list retrieved successfully`,
        ));
    }

    static async create(req, res) {
        const parsed = createMasterSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, 'Invalid master data.', getIssues(parsed.error));
        }

        const { branchId: requestedBranchId, ...fields } = parsed.data;
        const branchId = await resolveBranchId(req.user, requestedBranchId);
        const record = await this.Model.create({ ...fields, userId: req.user.id, branchId });
        res.status(201).json(new ApiResponse(
            201,
            record,
            `${this.label} created successfully`,
        ));
    }

    static async update(req, res) {
        const parsed = updateMasterSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, 'Invalid master data.', getIssues(parsed.error));
        }

        const filter = { _id: req.params.id, userId: req.user.id };
        if (!isAdmin(req.user)) filter.branchId = req.user.branchId;
        const record = await this.Model.findOneAndUpdate(
            filter,
            { $set: parsed.data },
            { returnDocument: 'after', runValidators: true },
        );
        if (!record) {
            throw new ApiError(404, `${this.label} was not found.`);
        }

        res.status(200).json(new ApiResponse(
            200,
            record,
            `${this.label} updated successfully`,
        ));
    }

    static async remove(req, res) {
        const filter = { _id: req.params.id, userId: req.user.id };
        if (!isAdmin(req.user)) filter.branchId = req.user.branchId;
        const record = await this.Model.findOne(filter);
        if (!record) {
            throw new ApiError(404, `${this.label} was not found.`);
        }

        const isInUse = await Transaction.exists({
            userId: req.user.id,
            branchId: record.branchId,
            [this.transactionField]: record.id,
        });
        if (isInUse) {
            throw new ApiError(
                409,
                `This ${this.label.toLowerCase()} is used by transactions and cannot be deleted.`,
            );
        }

        await record.deleteOne();
        res.status(200).json(new ApiResponse(
            200,
            {},
            `${this.label} deleted successfully`,
        ));
    }
}

export class ExpenseTypeController extends MasterController {
    static Model = ExpenseType;
    static label = 'Expense type';
    static transactionField = 'expenseTypeId';
}

export class IncomeTypeController extends MasterController {
    static Model = IncomeType;
    static label = 'Income type';
    static transactionField = 'incomeTypeId';
}

export class PaymentModeController extends MasterController {
    static Model = PaymentMode;
    static label = 'Payment mode';
    static transactionField = 'paymentModeId';
}
