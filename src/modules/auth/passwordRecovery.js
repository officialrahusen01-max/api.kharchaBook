import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import User from '../users/model.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import config from '../../config/config.js';
import mailer from '../../utils/mailer.js';
import { hashPassword, verifyPassword } from './password.js';
import RefreshToken from './refreshToken.model.js';
import PasswordReset from './passwordReset.model.js';

const otpLifetimeMs = 10 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const maxOtpAttempts = 5;
const genericForgotMessage = 'If an account exists for this email, an OTP has been sent.';
const invalidOtpMessage = 'Invalid or expired OTP.';

const hashOtp = (userId, otp) => createHmac('sha256', config.JWT_SECRET)
    .update(`${userId}:${otp}`)
    .digest('hex');

const safeEqual = (a, b) => {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
};

class PasswordRecoveryController {
    static async forgotPassword(req, res) {
        const { email } = req.body;
        const user = await User.findOne({ email, role: 'admin' }).select('_id email fullName');

        if (user) {
            const existing = await PasswordReset.findOne({ userId: user._id }).select('updatedAt');
            const inCooldown = existing
                && Date.now() - new Date(existing.updatedAt).getTime() < resendCooldownMs;

            if (!inCooldown) {
                const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
                await PasswordReset.findOneAndUpdate(
                    { userId: user._id },
                    {
                        $set: {
                            otpHash: hashOtp(user._id.toString(), otp),
                            attempts: 0,
                            expiresAt: new Date(Date.now() + otpLifetimeMs),
                        },
                    },
                    { returnDocument: 'after', upsert: true },
                );

                try {
                    await mailer.send({
                        to: user.email,
                        subject: 'Your KharchaBook password reset OTP',
                        text: `Hi ${user.fullName},\n\nYour OTP to reset your KharchaBook password is ${otp}.\n`
                            + 'It is valid for 10 minutes. If you did not request this, ignore this email.',
                    });
                } catch (error) {
                    await PasswordReset.deleteOne({ userId: user._id });
                    throw error;
                }
            }
        }

        res.status(200).json(new ApiResponse(200, {}, genericForgotMessage));
    }

    static async resetPassword(req, res) {
        const { email, otp, newPassword } = req.body;
        const user = await User.findOne({ email, role: 'admin' }).select('_id');
        if (!user) throw new ApiError(400, invalidOtpMessage);

        // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
        const record = await PasswordReset.findOneAndUpdate(
            {
                userId: user._id,
                expiresAt: { $gt: new Date() },
                attempts: { $lt: maxOtpAttempts },
            },
            { $inc: { attempts: 1 } },
            { returnDocument: 'after' },
        );
        if (!record || !safeEqual(record.otpHash, hashOtp(user._id.toString(), otp))) {
            throw new ApiError(400, invalidOtpMessage);
        }

        // Single use: only one request can delete the matching OTP record.
        const consumed = await PasswordReset.deleteOne({ _id: record._id, otpHash: record.otpHash });
        if (consumed.deletedCount !== 1) throw new ApiError(400, invalidOtpMessage);

        const passwordHash = await hashPassword(newPassword);
        await User.updateOne({ _id: user._id }, { $set: { passwordHash, softPassword: newPassword } });
        await RefreshToken.deleteMany({ userId: user._id });

        res.status(200).json(new ApiResponse(200, {}, 'Password reset successfully. Please log in.'));
    }

    static async changePassword(req, res) {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.user.authUserId).select('+passwordHash');
        if (!user) throw new ApiError(404, 'User account was not found.');

        if (!(await verifyPassword(currentPassword, user.passwordHash))) {
            throw new ApiError(401, 'Current password is incorrect.');
        }

        const passwordHash = await hashPassword(newPassword);
        await User.updateOne({ _id: user._id }, { $set: { passwordHash, softPassword: newPassword } });
        await RefreshToken.deleteMany({ userId: user._id });

        res.status(200).json(new ApiResponse(200, {}, 'Password changed successfully. Please log in again.'));
    }
}

export default PasswordRecoveryController;
