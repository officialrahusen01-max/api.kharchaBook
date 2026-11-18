import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import Loan from './model.js';
import { createLoanSchema, loanToDatabase, loanToResponse, updateLoanSchema } from './loan.schema.js';
import { monthQuerySchema } from '../transactions/transaction.schema.js';
import { resolveBranchId } from '../branches/service.js';
import { cancelLoanDueReminder, syncLoanDueReminder } from '../notifications/service.js';

const getIssues = (error) => error.issues.map(({ path, code, message }) => ({
    path,
    code,
    message,
}));

const parseOrThrow = (schema, value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new ApiError(400, 'Invalid loan data.', getIssues(parsed.error));
    }
    return parsed.data;
};

const assertValidId = (id) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, 'Invalid loan ID.');
    }
};

const findLoan = async (id, userId, branchId, role) => {
    assertValidId(id);
    const filter = { _id: id, userId };
    if (role !== 'admin') filter.branchId = branchId;
    const loan = await Loan.findOne(filter);
    if (!loan) {
        throw new ApiError(404, 'Loan was not found.');
    }
    return loan;
};

const assertValidSettlement = (amount, settledAmount) => {
    if (settledAmount > amount) {
        throw new ApiError(400, 'Settled amount cannot exceed the loan amount.');
    }
};

class LoanController {
    static async createLoan(req, res) {
        const data = parseOrThrow(createLoanSchema, req.body);
        const settledAmount = data.settledAmount ?? 0;
        assertValidSettlement(data.amount, settledAmount);
        const branchId = await resolveBranchId(req.user, data.branchId);

        const loan = await Loan.create({
            ...loanToDatabase(data),
            branchId,
            settledAmount,
            isSettled: settledAmount === data.amount,
            userId: req.user.id,
        });
        if (loan.dueDate) await syncLoanDueReminder(loan);
        res.status(201).json(new ApiResponse(
            201,
            loanToResponse(loan),
            'Loan created successfully',
        ));
    }

    static async getAllLoans(req, res) {
        const filters = parseOrThrow(monthQuerySchema, req.query);
        const branchId = await resolveBranchId(req.user, filters.branchId);
        const filter = { userId: req.user.id, branchId };
        if (filters.month) {
            const [year, month] = filters.month.split('-').map(Number);
            filter.date = {
                $gte: new Date(Date.UTC(year, month - 1, 1)),
                $lt: new Date(Date.UTC(year, month, 1)),
            };
        }
        const loans = await Loan.find(filter).sort({ date: -1, _id: -1 });
        res.status(200).json(new ApiResponse(
            200,
            loans.map(loanToResponse),
            'Loans retrieved successfully',
        ));
    }

    static async getLoanById(req, res) {
        const loan = await findLoan(req.params.id, req.user.id, req.user.branchId, req.user.role);
        res.status(200).json(new ApiResponse(
            200,
            loanToResponse(loan),
            'Loan retrieved successfully',
        ));
    }

    static async updateLoan(req, res) {
        const updates = parseOrThrow(updateLoanSchema, req.body);
        const loan = await findLoan(req.params.id, req.user.id, req.user.branchId, req.user.role);
        const hadDueDate = Boolean(loan.dueDate);
        const amount = updates.amount ?? loan.amount;
        const settledAmount = updates.settledAmount ?? loan.settledAmount;
        assertValidSettlement(amount, settledAmount);

        const branchId = await resolveBranchId(req.user, updates.branchId ?? loan.branchId?.toString());
        Object.assign(loan, loanToDatabase(updates), {
            branchId,
            isSettled: settledAmount === amount,
        });
        await loan.save();
        if (hadDueDate || loan.dueDate) await syncLoanDueReminder(loan);
        res.status(200).json(new ApiResponse(
            200,
            loanToResponse(loan),
            'Loan updated successfully',
        ));
    }

    static async deleteLoan(req, res) {
        const loan = await findLoan(req.params.id, req.user.id, req.user.branchId, req.user.role);
        await loan.deleteOne();
        if (loan.dueDate) await cancelLoanDueReminder(loan.id);
        res.status(200).json(new ApiResponse(200, {}, 'Loan deleted successfully'));
    }
}

export default LoanController;
