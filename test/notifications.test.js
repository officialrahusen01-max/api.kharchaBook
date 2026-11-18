import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getLoanReminderDate, isValidTimeZone } from '../src/utils/timeZone.js';

process.env.MONGODB_URI ??= 'mongodb://localhost:27017/kharcha-book-test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters-long';

const {
    createReminderSchema,
    updateReminderSchema,
} = await import('../src/modules/notifications/notification.schema.js');
const { buildPushMessage } = await import('../src/modules/notifications/delivery.js');
const {
    createLoanSchema,
    updateLoanSchema,
} = await import('../src/modules/loan/loan.schema.js');
const { default: Reminder } = await import('../src/modules/notifications/reminder.model.js');
const { syncLoanDueReminder } = await import('../src/modules/notifications/service.js');

test('loan due reminders are scheduled for 9 AM the day before in the selected timezone', () => {
    const reminder = getLoanReminderDate(new Date('2026-03-10T00:00:00.000Z'), 'Asia/Kolkata');

    assert.equal(reminder.toISOString(), '2026-03-09T03:30:00.000Z');
});

test('loan due reminder scheduling observes daylight-saving time', () => {
    const reminder = getLoanReminderDate(new Date('2026-03-10T00:00:00.000Z'), 'America/New_York');

    assert.equal(reminder.toISOString(), '2026-03-09T13:00:00.000Z');
});

test('notification and loan requests reject unknown time zones', () => {
    assert.equal(isValidTimeZone('Not/A_Timezone'), false);
    assert.equal(createReminderSchema.safeParse({
        title: 'Call',
        body: 'Call tomorrow',
        scheduledAt: '2027-01-01T10:00:00+05:30',
        timeZone: 'Not/A_Timezone',
    }).success, false);
    assert.equal(createLoanSchema.safeParse({
        personName: 'A Person',
        amount: 100,
        status: 'payable',
        phoneNumber: '9876543210',
        reminderTimeZone: 'Not/A_Timezone',
    }).success, false);
});

test('partial updates preserve existing time zones unless explicitly changed', () => {
    assert.deepEqual(updateLoanSchema.parse({ amount: 125 }), { amount: 125 });
    assert.deepEqual(updateReminderSchema.parse({ title: 'Updated title' }), {
        title: 'Updated title',
    });
});

test('push delivery accepts notification categories and serializes FCM data values', () => {
    assert.deepEqual(buildPushMessage({
        tokens: ['device-token'],
        title: 'Payment received',
        body: 'A payment was recorded.',
        data: {
            category: 'transaction',
            amount: 1250,
            route: '/transactions',
        },
    }), {
        tokens: ['device-token'],
        notification: {
            title: 'Payment received',
            body: 'A payment was recorded.',
        },
        data: {
            category: 'transaction',
            amount: '1250',
            route: '/transactions',
        },
    });
});

test('creating a loan due reminder schedules one push at 9 AM the previous day', async () => {
    const originalFindOne = Reminder.findOne;
    const originalCreate = Reminder.create;
    let reminder;
    Reminder.findOne = async () => null;
    Reminder.create = async (data) => {
        reminder = data;
        return data;
    };

    try {
        await syncLoanDueReminder({
            id: '64b0000000000000000000c1',
            userId: '64b000000000000000000001',
            branchId: '64b0000000000000000000b1',
            personName: 'A Person',
            amount: 1250,
            status: 'payable',
            dueDate: new Date('2099-12-10T00:00:00.000Z'),
            reminderTimeZone: 'Asia/Kolkata',
            isSettled: false,
        });

        assert.equal(reminder.type, 'loan_due');
        assert.equal(reminder.scheduledAt.toISOString(), '2099-12-09T03:30:00.000Z');
        assert.match(reminder.title, /payment due tomorrow/);
    } finally {
        Reminder.findOne = originalFindOne;
        Reminder.create = originalCreate;
    }
});

test('settling a loan cancels its pending due-date reminder', async () => {
    const originalFindOne = Reminder.findOne;
    const originalUpdateOne = Reminder.updateOne;
    let update;
    Reminder.findOne = async () => ({
        _id: '64b0000000000000000000c2',
        status: 'pending',
        scheduledAt: new Date('2099-12-09T03:30:00.000Z'),
    });
    Reminder.updateOne = async (filter, change) => {
        update = { filter, change };
    };

    try {
        await syncLoanDueReminder({
            id: '64b0000000000000000000c1',
            userId: '64b000000000000000000001',
            branchId: '64b0000000000000000000b1',
            personName: 'A Person',
            amount: 1250,
            status: 'payable',
            dueDate: new Date('2099-12-10T00:00:00.000Z'),
            reminderTimeZone: 'Asia/Kolkata',
            isSettled: true,
        });

        assert.deepEqual(update.filter.status, { $in: ['pending', 'sending', 'failed'] });
        assert.equal(update.change.$set.status, 'cancelled');
    } finally {
        Reminder.findOne = originalFindOne;
        Reminder.updateOne = originalUpdateOne;
    }
});
