import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { ExpenseType, IncomeType, PaymentMode } from './masters.model.js';
import Transaction from './model.js';
import { createMasterSchema, updateMasterSchema } from './master.schema.js';

const getIssues = (error) => error.issues.map(({ path, code, message }) => ({
    path,
    code,
    message,
}));

class MasterController {
    static async list(req, res) {
        const records = await this.Model.find({ userId: req.user.id }).sort({ name: 1 });
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

        const record = await this.Model.create({ ...parsed.data, userId: req.user.id });
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

        const record = await this.Model.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { $set: parsed.data },
            { new: true, runValidators: true },
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
        const record = await this.Model.findOne({ _id: req.params.id, userId: req.user.id });
        if (!record) {
            throw new ApiError(404, `${this.label} was not found.`);
        }

        const isInUse = await Transaction.exists({
            userId: req.user.id,
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
