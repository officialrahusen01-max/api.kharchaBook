import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { ExpenseType, IncomeType, PaymentMode } from './masters.model.js';
import Transaction from './model.js';
import { isAdmin, resolveBranchId } from '../branches/service.js';
import {
    createTransactionSchema,
    monthQuerySchema,
    transactionToDatabase,
    transactionToResponse,
    updateTransactionSchema,
} from './transaction.schema.js';

const getIssues = (error) => error.issues.map(({ path, code, message }) => ({
    path,
    code,
    message,
}));

const parseOrThrow = (schema, value, message) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new ApiError(400, message, getIssues(parsed.error));
    }
    return parsed.data;
};

const assertMasterBelongsToUser = async (Model, id, userId, label) => {
    const exists = await Model.exists({ _id: id, userId });
    if (!exists) {
        throw new ApiError(400, `${label} does not belong to the authenticated user.`);
    }
};

const validateReferences = async (data, userId) => {
    const checks = [
        assertMasterBelongsToUser(PaymentMode, data.paymentModeId, userId, 'Payment mode'),
    ];
    if (data.type === 'income') {
        checks.push(assertMasterBelongsToUser(IncomeType, data.incomeTypeId, userId, 'Income type'));
    } else {
        checks.push(assertMasterBelongsToUser(ExpenseType, data.expenseTypeId, userId, 'Expense type'));
    }
    await Promise.all(checks);
};

const monthRange = (month) => {
    const [year, monthNumber] = month.split('-').map(Number);
    return {
        start: new Date(Date.UTC(year, monthNumber - 1, 1)),
        end: new Date(Date.UTC(year, monthNumber, 1)),
    };
};

const selectedMonth = (month) => month ?? new Date().toISOString().slice(0, 7);

const transactionFilter = (userId, branchId, month) => {
    const filter = { userId, branchId };
    if (month) {
        const { start, end } = monthRange(month);
        filter.transactionDate = { $gte: start, $lt: end };
    }
    return filter;
};

// Branch users can only reach transactions of their own branch.
const accessibleTransactionFilter = (req) => {
    const filter = { _id: req.params.id, userId: req.user.id };
    if (!isAdmin(req.user)) {
        filter.branchId = req.user.branchId;
    }
    return filter;
};

class TransactionController {
    static async list(req, res) {
        const { month, branchId: requestedBranchId } = parseOrThrow(
            monthQuerySchema,
            req.query,
            'Invalid transaction filter.',
        );
        const branchId = await resolveBranchId(req.user, requestedBranchId);
        const transactions = await Transaction.find(transactionFilter(req.user.id, branchId, month))
            .sort({ transactionDate: -1, _id: -1 });
        res.status(200).json(new ApiResponse(
            200,
            transactions.map(transactionToResponse),
            'Transactions retrieved successfully',
        ));
    }

    static async create(req, res) {
        const data = parseOrThrow(createTransactionSchema, req.body, 'Invalid transaction data.');
        const [branchId] = await Promise.all([
            resolveBranchId(req.user, data.branchId),
            validateReferences(data, req.user.id),
        ]);
        const transaction = await Transaction.create({
            ...transactionToDatabase(data),
            branchId,
            userId: req.user.id,
        });
        res.status(201).json(new ApiResponse(
            201,
            transactionToResponse(transaction),
            'Transaction created successfully',
        ));
    }

    static async update(req, res) {
        if (!mongoose.isValidObjectId(req.params.id)) {
            throw new ApiError(400, 'Invalid transaction ID.');
        }
        const updates = parseOrThrow(updateTransactionSchema, req.body, 'Invalid transaction data.');
        const transaction = await Transaction.findOne(accessibleTransactionFilter(req));
        if (!transaction) {
            throw new ApiError(404, 'Transaction was not found.');
        }

        const current = {
            branchId: transaction.branchId?.toString(),
            type: transaction.type,
            expenseTypeId: transaction.expenseTypeId?.toString(),
            incomeTypeId: transaction.incomeTypeId?.toString(),
            paymentModeId: transaction.paymentModeId.toString(),
            amount: transaction.amountPaise / 100,
            transactionDate: transaction.transactionDate.toISOString(),
            note: transaction.note,
        };
        const mergedFields = { ...current, ...updates };
        if (updates.type === 'income' && current.type !== 'income') {
            mergedFields.expenseTypeId = undefined;
        }
        if (updates.type === 'expense' && current.type !== 'expense') {
            mergedFields.incomeTypeId = undefined;
        }
        const merged = parseOrThrow(
            createTransactionSchema,
            mergedFields,
            'Invalid transaction data.',
        );
        const [branchId] = await Promise.all([
            resolveBranchId(req.user, merged.branchId),
            validateReferences(merged, req.user.id),
        ]);

        const databaseFields = transactionToDatabase(merged);
        transaction.branchId = branchId;
        transaction.type = databaseFields.type;
        transaction.expenseTypeId = databaseFields.expenseTypeId;
        transaction.incomeTypeId = databaseFields.incomeTypeId;
        transaction.paymentModeId = databaseFields.paymentModeId;
        transaction.amountPaise = databaseFields.amountPaise;
        transaction.transactionDate = databaseFields.transactionDate;
        transaction.note = databaseFields.note;
        await transaction.save();

        res.status(200).json(new ApiResponse(
            200,
            transactionToResponse(transaction),
            'Transaction updated successfully',
        ));
    }

    static async remove(req, res) {
        if (!mongoose.isValidObjectId(req.params.id)) {
            throw new ApiError(400, 'Invalid transaction ID.');
        }
        const transaction = await Transaction.findOneAndDelete(accessibleTransactionFilter(req));
        if (!transaction) {
            throw new ApiError(404, 'Transaction was not found.');
        }
        res.status(200).json(new ApiResponse(200, {}, 'Transaction deleted successfully'));
    }

    static async summary(req, res) {
        const { month: requestedMonth, branchId: requestedBranchId } = parseOrThrow(
            monthQuerySchema,
            req.query,
            'Invalid transaction filter.',
        );
        const month = selectedMonth(requestedMonth);
        const branchId = await resolveBranchId(req.user, requestedBranchId);
        const match = {
            userId: new mongoose.Types.ObjectId(req.user.id),
            branchId: new mongoose.Types.ObjectId(branchId),
        };
        const [monthly, totals] = await Promise.all([
            Transaction.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m',
                                date: '$transactionDate',
                                timezone: 'UTC',
                            },
                        },
                        incomePaise: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'income'] }, '$amountPaise', 0],
                            },
                        },
                        expensePaise: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'expense'] }, '$amountPaise', 0],
                            },
                        },
                    },
                },
                { $sort: { _id: 1 } },
            ]),
            Transaction.aggregate([
                { $match: match },
                {
                    $group: {
                        _id: null,
                        incomePaise: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'income'] }, '$amountPaise', 0],
                            },
                        },
                        expensePaise: {
                            $sum: {
                                $cond: [{ $eq: ['$type', 'expense'] }, '$amountPaise', 0],
                            },
                        },
                    },
                },
            ]),
        ]);

        const monthTotals = monthly.find(({ _id }) => _id === month) ?? {
            incomePaise: 0,
            expensePaise: 0,
        };
        const allTimeTotals = totals[0] ?? { incomePaise: 0, expensePaise: 0 };
        const data = {
            branchId,
            month,
            monthlyIncome: monthTotals.incomePaise / 100,
            monthlyExpense: monthTotals.expensePaise / 100,
            monthlyBalance: (monthTotals.incomePaise - monthTotals.expensePaise) / 100,
            totalIncome: allTimeTotals.incomePaise / 100,
            totalExpense: allTimeTotals.expensePaise / 100,
            totalBalance: (allTimeTotals.incomePaise - allTimeTotals.expensePaise) / 100,
            currency: 'INR',
            months: monthly.map(({ _id, incomePaise, expensePaise }) => ({
                month: _id,
                income: incomePaise / 100,
                expense: expensePaise / 100,
                balance: (incomePaise - expensePaise) / 100,
                currency: 'INR',
            })),
        };

        res.status(200).json(new ApiResponse(200, data, 'Transaction summary retrieved successfully'));
    }
}

export default TransactionController;
