import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        required: true,
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true,
    },
    expenseTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ExpenseType',
    },
    incomeTypeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'IncomeType',
    },
    paymentModeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PaymentMode',
        required: true,
    },
    amountPaise: {
        type: Number,
        required: true,
        min: 1,
        validate: Number.isSafeInteger,
    },
    transactionDate: {
        type: Date,
        required: true,
    },
    note: {
        type: String,
        trim: true,
        maxlength: 500,
        default: '',
    },
}, {
    timestamps: true,
    versionKey: false,
});

transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, branchId: 1, transactionDate: -1 });

const Transaction = mongoose.models.Transaction
    || mongoose.model('Transaction', transactionSchema);

export default Transaction;
