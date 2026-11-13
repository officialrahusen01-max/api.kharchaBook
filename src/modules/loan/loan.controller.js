import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import Loan from './model.js';
import { createLoanSchema, loanToDatabase, loanToResponse, updateLoanSchema } from './loan.schema.js';

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

const findLoan = async (id, userId) => {
    assertValidId(id);
    const loan = await Loan.findOne({ _id: id, userId });
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

        const loan = await Loan.create({
            ...loanToDatabase(data),
            settledAmount,
            isSettled: settledAmount === data.amount,
            userId: req.user.id,
        });
        res.status(201).json(new ApiResponse(
            201,
            loanToResponse(loan),
            'Loan created successfully',
        ));
    }

    static async getAllLoans(req, res) {
        const loans = await Loan.find({ userId: req.user.id }).sort({ date: -1, _id: -1 });
        res.status(200).json(new ApiResponse(
            200,
            loans.map(loanToResponse),
            'Loans retrieved successfully',
        ));
    }

    static async getLoanById(req, res) {
        const loan = await findLoan(req.params.id, req.user.id);
        res.status(200).json(new ApiResponse(
            200,
            loanToResponse(loan),
            'Loan retrieved successfully',
        ));
    }

    static async updateLoan(req, res) {
        const updates = parseOrThrow(updateLoanSchema, req.body);
        const loan = await findLoan(req.params.id, req.user.id);
        const amount = updates.amount ?? loan.amount;
        const settledAmount = updates.settledAmount ?? loan.settledAmount;
        assertValidSettlement(amount, settledAmount);

        Object.assign(loan, loanToDatabase(updates), {
            isSettled: settledAmount === amount,
        });
        await loan.save();
        res.status(200).json(new ApiResponse(
            200,
            loanToResponse(loan),
            'Loan updated successfully',
        ));
    }

    static async deleteLoan(req, res) {
        const loan = await findLoan(req.params.id, req.user.id);
        await loan.deleteOne();
        res.status(200).json(new ApiResponse(200, {}, 'Loan deleted successfully'));
    }
}

export default LoanController;
