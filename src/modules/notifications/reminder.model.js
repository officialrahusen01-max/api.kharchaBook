import mongoose from 'mongoose';

const reminderSchema = new mongoose.Schema({
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
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    type: {
        type: String,
        enum: ['custom', 'loan_due'],
        required: true,
    },
    loanId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Loan',
        default: null,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100,
    },
    body: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500,
    },
    scheduledAt: {
        type: Date,
        required: true,
        index: true,
    },
    timeZone: {
        type: String,
        required: true,
        maxlength: 100,
    },
    status: {
        type: String,
        enum: ['pending', 'sending', 'sent', 'failed', 'cancelled'],
        default: 'pending',
        index: true,
    },
    attempts: {
        type: Number,
        default: 0,
        min: 0,
    },
    nextAttemptAt: {
        type: Date,
        default: null,
    },
    lockedAt: {
        type: Date,
        default: null,
    },
    sentAt: {
        type: Date,
        default: null,
    },
    lastError: {
        type: String,
        maxlength: 200,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});

reminderSchema.index(
    { loanId: 1 },
    { unique: true, partialFilterExpression: { type: 'loan_due', loanId: { $type: 'objectId' } } },
);
reminderSchema.index({ status: 1, scheduledAt: 1, nextAttemptAt: 1 });
reminderSchema.index({ userId: 1, branchId: 1, scheduledAt: -1 });

const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);

export default Reminder;
