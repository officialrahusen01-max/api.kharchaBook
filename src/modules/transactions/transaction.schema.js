import { z } from 'zod';

const objectId = z.string().regex(/^[\da-f]{24}$/i, 'Must be a valid ID.');
const money = z.number().finite().positive().max(999999999999.99)
    .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
        'Amount can have at most 2 decimal places.',
    );
const transactionDate = z.string().datetime({ offset: true }).or(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    }, 'Enter a valid date.'),
);

const transactionFieldsSchema = z.object({
    branchId: objectId.optional(),
    type: z.enum(['income', 'expense']),
    expenseTypeId: objectId.optional(),
    incomeTypeId: objectId.optional(),
    paymentModeId: objectId,
    amount: money,
    transactionDate,
    note: z.string().trim().max(500).optional(),
}).strict();

export const createTransactionSchema = transactionFieldsSchema.superRefine((value, context) => {
    if (value.type === 'expense' && !value.expenseTypeId) {
        context.addIssue({
            code: 'custom',
            path: ['expenseTypeId'],
            message: 'Expense type is required for expense transactions.',
        });
    }
    if (value.type === 'expense' && value.incomeTypeId) {
        context.addIssue({
            code: 'custom',
            path: ['incomeTypeId'],
            message: 'Income type cannot be set on an expense transaction.',
        });
    }
    if (value.type === 'income' && !value.incomeTypeId) {
        context.addIssue({
            code: 'custom',
            path: ['incomeTypeId'],
            message: 'Income type is required for income transactions.',
        });
    }
    if (value.type === 'income' && value.expenseTypeId) {
        context.addIssue({
            code: 'custom',
            path: ['expenseTypeId'],
            message: 'Expense type cannot be set on an income transaction.',
        });
    }
});

export const updateTransactionSchema = transactionFieldsSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.',
);

export const monthQuerySchema = z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format.').optional(),
    branchId: objectId.optional(),
}).strict();

export const transactionToDatabase = (data) => {
    const {
        amount,
        transactionDate,
        ...fields
    } = data;
    return {
        ...fields,
        amountPaise: Math.round(amount * 100),
        transactionDate: new Date(
            transactionDate.length === 10
                ? `${transactionDate}T00:00:00.000Z`
                : transactionDate,
        ),
    };
};

export const transactionToResponse = (transaction) => ({
    id: transaction.id,
    branchId: transaction.branchId,
    type: transaction.type,
    expenseTypeId: transaction.expenseTypeId ?? null,
    incomeTypeId: transaction.incomeTypeId ?? null,
    paymentModeId: transaction.paymentModeId,
    amount: transaction.amountPaise / 100,
    currency: 'INR',
    transactionDate: transaction.transactionDate,
    note: transaction.note,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
});
