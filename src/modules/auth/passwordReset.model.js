import mongoose from 'mongoose';

const passwordResetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    otpHash: {
        type: String,
        required: true,
    },
    attempts: {
        type: Number,
        default: 0,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
}, {
    timestamps: true,
    versionKey: false,
});

const PasswordReset = mongoose.models.PasswordReset
    || mongoose.model('PasswordReset', passwordResetSchema);

export default PasswordReset;
