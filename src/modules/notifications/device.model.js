import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    authUserId: {
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
    role: {
        type: String,
        enum: ['admin', 'user'],
        required: true,
    },
    token: {
        type: String,
        required: true,
        select: false,
        maxlength: 4096,
        unique: true,
    },
    platform: {
        type: String,
        enum: ['android', 'ios', 'web'],
        required: true,
    },
    deviceId: {
        type: String,
        trim: true,
        maxlength: 200,
        default: null,
    },
    lastSeenAt: {
        type: Date,
        default: Date.now,
    },
}, {
    timestamps: true,
    versionKey: false,
});

deviceSchema.index({ userId: 1, branchId: 1 });

const FcmDevice = mongoose.models.FcmDevice || mongoose.model('FcmDevice', deviceSchema);

export default FcmDevice;
