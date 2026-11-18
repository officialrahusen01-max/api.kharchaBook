import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import { resolveBranchId } from '../branches/service.js';
import FcmDevice from './device.model.js';
import Reminder from './reminder.model.js';
import {
    createReminderSchema,
    registerDeviceSchema,
    reminderFilterSchema,
    reminderToResponse,
    updateReminderSchema,
} from './notification.schema.js';

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

const assertValidId = (id, label) => {
    if (!mongoose.isValidObjectId(id)) {
        throw new ApiError(400, `Invalid ${label} ID.`);
    }
};

const deviceToResponse = (device) => ({
    id: device.id,
    branchId: device.branchId,
    platform: device.platform,
    deviceId: device.deviceId,
    lastSeenAt: device.lastSeenAt,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
});

const accessibleReminderFilter = (req) => {
    const filter = { _id: req.params.id, userId: req.user.id };
    if (req.user.role !== 'admin') filter.branchId = req.user.branchId;
    return filter;
};

const findReminder = async (req) => {
    assertValidId(req.params.id, 'reminder');
    const reminder = await Reminder.findOne(accessibleReminderFilter(req));
    if (!reminder) {
        throw new ApiError(404, 'Reminder was not found.');
    }
    return reminder;
};

const scheduledAtFrom = (value) => new Date(value);

class NotificationController {
    static async listDevices(req, res) {
        const devices = await FcmDevice.find({
            userId: req.user.id,
            authUserId: req.user.authUserId,
        }).sort({ lastSeenAt: -1 });
        res.status(200).json(new ApiResponse(
            200,
            devices.map(deviceToResponse),
            'Notification devices retrieved successfully',
        ));
    }

    static async registerDevice(req, res) {
        const data = parseOrThrow(registerDeviceSchema, req.body, 'Invalid notification device data.');
        const branchId = await resolveBranchId(req.user, data.branchId);
        const existing = await FcmDevice.findOne({ token: data.token }).select('+token');
        if (existing && String(existing.userId) !== String(req.user.id)) {
            throw new ApiError(409, 'This notification token is already registered to another account.');
        }

        const device = await FcmDevice.findOneAndUpdate(
            { token: data.token },
            {
                $set: {
                    userId: req.user.id,
                    authUserId: req.user.authUserId,
                    branchId,
                    role: req.user.role,
                    platform: data.platform,
                    deviceId: data.deviceId ?? null,
                    lastSeenAt: new Date(),
                },
                $setOnInsert: { token: data.token },
            },
            { new: true, upsert: true, runValidators: true },
        );
        res.status(201).json(new ApiResponse(
            201,
            deviceToResponse(device),
            'Notification device registered successfully',
        ));
    }

    static async removeDevice(req, res) {
        assertValidId(req.params.id, 'device');
        const device = await FcmDevice.findOneAndDelete({
            _id: req.params.id,
            userId: req.user.id,
            authUserId: req.user.authUserId,
        });
        if (!device) {
            throw new ApiError(404, 'Notification device was not found.');
        }
        res.status(200).json(new ApiResponse(200, {}, 'Notification device removed successfully'));
    }

    static async listReminders(req, res) {
        const filters = parseOrThrow(
            reminderFilterSchema,
            req.query,
            'Invalid reminder filters.',
        );
        const branchId = await resolveBranchId(req.user, filters.branchId);
        const reminders = await Reminder.find({
            userId: req.user.id,
            branchId,
        }).sort({ scheduledAt: -1, _id: -1 }).limit(100);
        res.status(200).json(new ApiResponse(
            200,
            reminders.map(reminderToResponse),
            'Reminders retrieved successfully',
        ));
    }

    static async createReminder(req, res) {
        const data = parseOrThrow(
            createReminderSchema,
            req.body,
            'Invalid reminder data.',
        );
        const scheduledAt = scheduledAtFrom(data.scheduledAt);
        if (scheduledAt <= new Date()) {
            throw new ApiError(400, 'Reminder time must be in the future.');
        }
        const branchId = await resolveBranchId(req.user, data.branchId);
        const reminder = await Reminder.create({
            ...data,
            scheduledAt,
            branchId,
            userId: req.user.id,
            createdBy: req.user.authUserId,
            type: 'custom',
        });
        res.status(201).json(new ApiResponse(
            201,
            reminderToResponse(reminder),
            'Reminder created successfully',
        ));
    }

    static async updateReminder(req, res) {
        const updates = parseOrThrow(
            updateReminderSchema,
            req.body,
            'Invalid reminder data.',
        );
        const reminder = await findReminder(req);
        if (reminder.type !== 'custom') {
            throw new ApiError(409, 'Loan due-date reminders are managed by the loan record.');
        }
        if (!['pending', 'failed'].includes(reminder.status)) {
            throw new ApiError(409, 'Only pending or failed reminders can be updated.');
        }

        if (updates.scheduledAt) {
            updates.scheduledAt = scheduledAtFrom(updates.scheduledAt);
            if (updates.scheduledAt <= new Date()) {
                throw new ApiError(400, 'Reminder time must be in the future.');
            }
        }
        Object.assign(reminder, updates, {
            status: 'pending',
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
        });
        await reminder.save();
        res.status(200).json(new ApiResponse(
            200,
            reminderToResponse(reminder),
            'Reminder updated successfully',
        ));
    }

    static async removeReminder(req, res) {
        const reminder = await findReminder(req);
        if (reminder.type !== 'custom') {
            throw new ApiError(409, 'Loan due-date reminders are managed by the loan record.');
        }
        if (reminder.status === 'sending') {
            throw new ApiError(409, 'A reminder being sent cannot be cancelled.');
        }
        await reminder.deleteOne();
        res.status(200).json(new ApiResponse(200, {}, 'Reminder deleted successfully'));
    }
}

export default NotificationController;
