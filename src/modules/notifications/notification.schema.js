import { z } from 'zod';
import config from '../../config/config.js';
import { isValidTimeZone } from '../../utils/timeZone.js';

const objectId = z.string().regex(/^[\da-f]{24}$/i, 'Invalid ID.');
const timeZone = z.string().trim().min(1).max(100).refine(
    isValidTimeZone,
    'Use a valid IANA time zone, such as Asia/Kolkata.',
);

export const registerDeviceSchema = z.object({
    token: z.string().trim().min(1).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
    deviceId: z.string().trim().min(1).max(200).optional(),
    branchId: objectId.optional(),
}).strict();

const reminderFieldsSchema = z.object({
    title: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(500),
    scheduledAt: z.string().datetime({ offset: true }),
    timeZone: timeZone.optional(),
    branchId: objectId.optional(),
}).strict();

export const createReminderSchema = reminderFieldsSchema.extend({
    timeZone: timeZone.default(config.DEFAULT_TIME_ZONE),
});

export const updateReminderSchema = reminderFieldsSchema
    .omit({ branchId: true })
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided.');

export const reminderFilterSchema = z.object({
    branchId: objectId.optional(),
}).strict();

export const reminderToResponse = (reminder) => ({
    id: reminder.id,
    type: reminder.type,
    loanId: reminder.loanId ?? null,
    title: reminder.title,
    body: reminder.body,
    scheduledAt: reminder.scheduledAt,
    timeZone: reminder.timeZone,
    status: reminder.status,
    sentAt: reminder.sentAt ?? null,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
});
