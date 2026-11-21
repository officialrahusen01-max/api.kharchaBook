import { z } from 'zod';
import config from '../../config/config.js';
import { isValidTimeZone } from '../../utils/timeZone.js';

const reminderTimeZone = z.string().trim().min(1).max(100).refine(
    isValidTimeZone,
    'Use a valid IANA time zone, such as Asia/Kolkata.',
);

const dateString = z.string().datetime({ offset: true }).or(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
        const parsed = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
    }, 'Enter a valid date.'),
);

const loanFieldsSchema = z.object({
    branchId: z.string().regex(/^[\da-f]{24}$/i, 'Invalid branch ID.').optional(),
    personName: z.string().trim().min(1).max(100),
    amount: z.number().finite().positive().max(999999999999.99),
    status: z.enum(['payable', 'receivable']),
    date: dateString.optional(),
    dueDate: dateString.nullable().optional(),
    reminderTimeZone: reminderTimeZone.optional(),
    phoneNumber: z.string().trim().regex(/^[0-9]{10}$/, 'Invalid phone number.'),
    description: z.string().trim().max(1000).optional(),
    settledAmount: z.number().finite().min(0).max(999999999999.99).optional(),
}).strict();

export const createLoanSchema = loanFieldsSchema.extend({
    reminderTimeZone: reminderTimeZone.default(config.DEFAULT_TIME_ZONE),
});

export const updateLoanSchema = loanFieldsSchema.partial().refine(
    (value) => Object.keys(value).length > 0,
    'At least one field must be provided.',
);

export const loanToDatabase = (data) => ({
    ...data,
    ...(data.date === undefined ? {} : { date: new Date(data.date) }),
    ...(data.dueDate === undefined || data.dueDate === null
        ? {}
        : { dueDate: new Date(data.dueDate) }),
});

export const loanToResponse = (loan) => ({
    id: loan.id,
    branchId: loan.branchId,
    personName: loan.personName,
    amount: loan.amount,
    status: loan.status,
    date: loan.date,
    dueDate: loan.dueDate ?? null,
    reminderTimeZone: loan.reminderTimeZone ?? config.DEFAULT_TIME_ZONE,
    phoneNumber: loan.phoneNumber,
    description: loan.description ?? '',
    settledAmount: loan.settledAmount,
    isSettled: loan.isSettled,
    createdAt: loan.createdAt,
    updatedAt: loan.updatedAt,
});