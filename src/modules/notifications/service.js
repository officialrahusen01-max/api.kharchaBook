import Reminder from './reminder.model.js';
import { sendPushNotification } from './delivery.js';
import Loan from '../loan/model.js';
import { getLoanReminderDate } from '../../utils/timeZone.js';
import logger from '../../utils/logger.js';
import config from '../../config/config.js';

const maximumAttempts = 5;
const staleLockMs = 5 * 60 * 1000;
const loanReconciliationIntervalMs = 15 * 60 * 1000;

const isSameInstant = (left, right) => (
    left instanceof Date
    && right instanceof Date
    && left.valueOf() === right.valueOf()
);

const loanReminderContent = (loan) => ({
    title: loan.status === 'payable' ? 'Loan payment due tomorrow' : 'Loan collection due tomorrow',
    body: `${loan.personName}: INR ${Number(loan.amount).toFixed(2)} is due tomorrow.`,
});

export const syncLoanDueReminder = async (loan) => {
    if (!loan.dueDate) {
        await cancelLoanDueReminder(loan.id ?? loan._id);
        return;
    }

    const loanId = loan._id ?? loan.id;
    const filter = { type: 'loan_due', loanId };
    const reminderTimeZone = loan.reminderTimeZone || config.DEFAULT_TIME_ZONE;
    const scheduledAt = getLoanReminderDate(loan.dueDate, reminderTimeZone);
    const existing = await Reminder.findOne(filter);

    if (loan.isSettled || scheduledAt <= new Date()) {
        if (existing && ['pending', 'sending', 'failed'].includes(existing.status)) {
            await Reminder.updateOne(
                { _id: existing._id, status: { $in: ['pending', 'sending', 'failed'] } },
                { $set: { status: 'cancelled', lockedAt: null } },
            );
        }
        return;
    }

    const content = loanReminderContent(loan);
    const reminderData = {
        userId: loan.userId,
        branchId: loan.branchId,
        createdBy: loan.userId,
        loanId,
        ...content,
        scheduledAt,
        timeZone: reminderTimeZone,
    };

    if (!existing) {
        await Reminder.create({ ...reminderData, type: 'loan_due' });
        return;
    }

    if (isSameInstant(existing.scheduledAt, scheduledAt) && existing.status !== 'cancelled') {
        if (existing.title !== content.title || existing.body !== content.body) {
            await Reminder.updateOne(
                { _id: existing._id, status: { $in: ['pending', 'sending'] } },
                { $set: content },
            );
        }
        return;
    }

    await Reminder.updateOne(
        { _id: existing._id, status: { $in: ['pending', 'sending', 'failed', 'cancelled', 'sent'] } },
        {
            $set: {
                ...reminderData,
                status: 'pending',
                attempts: 0,
                nextAttemptAt: null,
                lockedAt: null,
                sentAt: null,
                lastError: null,
            },
        },
    );
};

export const cancelLoanDueReminder = async (loanId) => {
    if (!loanId) return;
    await Reminder.updateOne(
        { type: 'loan_due', loanId, status: { $in: ['pending', 'sending', 'failed'] } },
        { $set: { status: 'cancelled', lockedAt: null } },
    );
};

const validateLoanReminder = async (reminder) => {
    const loan = await Loan.findOne({
        _id: reminder.loanId,
        userId: reminder.userId,
        branchId: reminder.branchId,
    });
    if (!loan || loan.isSettled || !loan.dueDate) {
        await cancelLoanDueReminder(reminder.loanId);
        return false;
    }

    const expectedTime = getLoanReminderDate(
        loan.dueDate,
        loan.reminderTimeZone || config.DEFAULT_TIME_ZONE,
    );
    if (expectedTime <= new Date()) {
        await cancelLoanDueReminder(reminder.loanId);
        return false;
    }
    if (!isSameInstant(expectedTime, reminder.scheduledAt)) {
        await syncLoanDueReminder(loan);
        return false;
    }
    return true;
};

const processReminder = async (reminder) => {
    if (reminder.type === 'loan_due' && !(await validateLoanReminder(reminder))) {
        return;
    }

    try {
        await sendPushNotification({
            userId: reminder.userId,
            branchId: reminder.branchId,
            title: reminder.title,
            body: reminder.body,
            data: {
                category: 'reminder',
                reminderId: reminder.id,
                type: reminder.type,
                loanId: reminder.loanId?.toString() ?? '',
                route: reminder.type === 'loan_due' ? '/loans' : '/reminders',
            },
        });
        await Reminder.updateOne(
            { _id: reminder._id, status: 'sending' },
            {
                $set: {
                    status: 'sent',
                    sentAt: new Date(),
                    lockedAt: null,
                    nextAttemptAt: null,
                    lastError: null,
                },
            },
        );
    } catch (error) {
        const retry = reminder.attempts < maximumAttempts;
        const delayMs = Math.min(60 * 60 * 1000, 60 * 1000 * (2 ** (reminder.attempts - 1)));
        await Reminder.updateOne(
            { _id: reminder._id, status: 'sending' },
            {
                $set: {
                    status: retry ? 'pending' : 'failed',
                    nextAttemptAt: retry ? new Date(Date.now() + delayMs) : null,
                    lockedAt: null,
                    lastError: error.code || error.name || 'delivery_error',
                },
            },
        );
        logger.error(`Push delivery failed for reminder ${reminder.id}: ${error.code || error.name || 'delivery_error'}`);
    }
};

export const processDueReminders = async () => {
    const now = new Date();
    const staleLock = new Date(now.valueOf() - staleLockMs);
    await Reminder.updateMany(
        { status: 'sending', lockedAt: { $lt: staleLock } },
        { $set: { status: 'pending', lockedAt: null, nextAttemptAt: now } },
    );
    await Reminder.updateMany(
        { status: 'pending', attempts: { $gte: maximumAttempts } },
        { $set: { status: 'failed', nextAttemptAt: null } },
    );

    for (let sent = 0; sent < 100; sent += 1) {
        const reminder = await Reminder.findOneAndUpdate(
            {
                status: 'pending',
                scheduledAt: { $lte: now },
                attempts: { $lt: maximumAttempts },
                $or: [
                    { nextAttemptAt: null },
                    { nextAttemptAt: { $lte: now } },
                ],
            },
            {
                $set: { status: 'sending', lockedAt: now },
                $inc: { attempts: 1 },
            },
            { returnDocument: 'after', sort: { scheduledAt: 1, _id: 1 } },
        );
        if (!reminder) break;
        await processReminder(reminder);
    }
};

export const reconcileUpcomingLoanReminders = async () => {
    const cursor = Loan.find({
        dueDate: { $gt: new Date() },
        isSettled: { $ne: true },
    }).cursor();

    for await (const loan of cursor) {
        await syncLoanDueReminder(loan);
    }
};

let scheduler;
let processing = false;
let activeRun = Promise.resolve();
let lastLoanReconciliationAt = 0;

export const startReminderScheduler = () => {
    if (scheduler) return;

    const run = async () => {
        if (processing) return;
        processing = true;
        activeRun = (async () => {
            if (Date.now() - lastLoanReconciliationAt >= loanReconciliationIntervalMs) {
                await reconcileUpcomingLoanReminders();
                lastLoanReconciliationAt = Date.now();
            }
            await processDueReminders();
        })()
            .catch((error) => {
                logger.error('Reminder scheduler failed:', error);
            })
            .finally(() => {
                processing = false;
            });
        await activeRun;
    };

    scheduler = setInterval(run, 60 * 1000);
    scheduler.unref();
    void run();
};

export const stopReminderScheduler = () => {
    if (scheduler) clearInterval(scheduler);
    scheduler = undefined;
    lastLoanReconciliationAt = 0;
    return activeRun;
};
