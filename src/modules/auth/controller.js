import User from '../users/model.js';
import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import config from '../../config/config.js';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import RefreshToken from './refreshToken.model.js';
import { deleteProfilePhoto } from '../users/profilePhoto.js';
import Transaction from '../transactions/model.js';
import { ExpenseType, IncomeType, PaymentMode } from '../transactions/masters.model.js';
import Branch from '../branches/model.js';
import { createDefaultBranch } from '../branches/service.js';
import { branchToResponse } from '../branches/branch.schema.js';

const { sign } = jwt;
const accessTokenLifetimeSeconds = 60 * 60;
const refreshTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const refreshCookieName = 'refreshToken';
const refreshCookiePath = '/api/v1/auth';
const refreshCookieOptions = {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: refreshCookiePath,
    maxAge: refreshTokenLifetimeMs,
};

const hashRefreshToken = (token) => createHash('sha256').update(token).digest('hex');

const createRefreshToken = () => randomBytes(64).toString('base64url');

const createAccessToken = (userId, branch) => sign(
    { branchId: String(branch._id ?? branch.id), role: branch.role },
    config.JWT_SECRET,
    {
        subject: userId,
        issuer: 'kharcha-book-api',
        audience: 'kharcha-book-client',
        expiresIn: accessTokenLifetimeSeconds,
        algorithm: 'HS256',
    },
);

const getRefreshTokenTransport = (req) => {
    const transport = req.get('X-Refresh-Token-Transport')?.toLowerCase() ?? 'body';
    if (transport !== 'body' && transport !== 'cookie') {
        throw new ApiError(400, 'X-Refresh-Token-Transport must be "body" or "cookie".');
    }
    return transport;
};

const readCookie = (req, name) => {
    const cookie = req.get('cookie')
        ?.split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name}=`));
    return cookie?.slice(name.length + 1);
};

const readRefreshToken = (req) => req.body?.refreshToken || readCookie(req, refreshCookieName);

const setRefreshCookie = (res, token) => {
    res.cookie(refreshCookieName, token, refreshCookieOptions);
};

const clearRefreshCookie = (res) => {
    res.clearCookie(refreshCookieName, {
        httpOnly: refreshCookieOptions.httpOnly,
        secure: refreshCookieOptions.secure,
        sameSite: refreshCookieOptions.sameSite,
        path: refreshCookiePath,
    });
};

const setRefreshTokenResponse = (res, data, transport, refreshToken) => {
    if (transport === 'cookie') {
        setRefreshCookie(res, refreshToken);
        return data;
    }
    return { ...data, refreshToken };
};

const toPublicUser = (user) => ({
    id: user.id,
    fullName: user.fullName,
    phoneNumber: user.phoneNumber,
    email: user.email,
    gender: user.gender,
    dob: user.dob,
    accountType: user.accountType,
    organisationName: user.organisationName ?? null,
    address: user.address ?? null,
    defaultBranchId: user.defaultBranchId?.toString() ?? null,
    createdAt: user.createdAt,
});

class AuthController {
    static async register(req, res) {
        const {
            fullName,
            phoneNumber,
            email,
            gender,
            dob,
            password,
            accountType,
            organisationName,
            address,
        } = req.body;
        const normalizedEmail = email.toLowerCase();
        const [existingUser, existingBranch] = await Promise.all([
            User.findOne({ $or: [{ email: normalizedEmail }, { phoneNumber }] }).select('_id'),
            Branch.exists({ phoneNumber }),
        ]);

        if (existingUser || existingBranch) {
            throw new ApiError(409, 'An account with this email or phone number already exists.');
        }

        const passwordHash = await hashPassword(password);
        const user = await User.create({
            fullName,
            phoneNumber,
            email: normalizedEmail,
            gender,
            dob,
            accountType,
            organisationName: accountType === 'business' ? organisationName : null,
            address,
        });

        let defaultBranch;
        try {
            defaultBranch = await createDefaultBranch(user.id, user, passwordHash);
        } catch (error) {
            await User.deleteOne({ _id: user.id });
            throw error;
        }

        const publicUser = { ...toPublicUser(user), defaultBranchId: defaultBranch.id };
        res.status(201).json(new ApiResponse(201, publicUser, 'User registered successfully'));
    }

    static async login(req, res) {
        const { phoneNumber, password } = req.body;

        if (!phoneNumber) {
            throw new ApiError(400, 'Phone number must be provided for login.');
        }
        if (!password) {
            throw new ApiError(400, 'Password must be provided for login.');
        }

        const branch = await Branch.findOne({ phoneNumber }).select('+passwordHash');
        const isMatch = branch ? await verifyPassword(password, branch.passwordHash) : false;
        const user = isMatch ? await User.findById(branch.userId) : null;
        if (!user) {
            throw new ApiError(401, 'Invalid phone number or password.');
        }

        const transport = getRefreshTokenTransport(req);
        const accessToken = createAccessToken(user.id, branch);
        const refreshToken = createRefreshToken();
        const tokenHash = hashRefreshToken(refreshToken);
        const expiresAt = new Date(Date.now() + refreshTokenLifetimeMs);
        await RefreshToken.findOneAndUpdate(
            { branchId: branch.id },
            {
                $set: { tokenHash, expiresAt },
                $setOnInsert: { userId: user.id, branchId: branch.id },
            },
            { new: true, upsert: true },
        );
        await RefreshToken.deleteMany({
            branchId: branch.id,
            tokenHash: { $ne: tokenHash },
        });

        const data = setRefreshTokenResponse(res, {
            user: toPublicUser(user),
            branch: branchToResponse(branch, user.defaultBranchId),
            role: branch.role,
            accessToken,
            tokenType: 'Bearer',
            expiresIn: accessTokenLifetimeSeconds,
        }, transport, refreshToken);

        res.status(200).json(new ApiResponse(200, data, 'Login successful'));
    }

    static async refresh(req, res) {
        const currentRefreshToken = readRefreshToken(req);
        if (typeof currentRefreshToken !== 'string' || currentRefreshToken.length === 0) {
            throw new ApiError(401, 'A valid refresh token must be provided.');
        }

        const nextRefreshToken = createRefreshToken();
        const expiresAt = new Date(Date.now() + refreshTokenLifetimeMs);
        const session = await RefreshToken.findOneAndUpdate(
            {
                tokenHash: hashRefreshToken(currentRefreshToken),
                expiresAt: { $gt: new Date() },
            },
            {
                $set: {
                    tokenHash: hashRefreshToken(nextRefreshToken),
                    expiresAt,
                },
            },
            { new: true },
        );

        if (!session) {
            throw new ApiError(401, 'Invalid or expired refresh token.');
        }

        const branch = await Branch.findOne({ _id: session.branchId, userId: session.userId });
        if (!branch) {
            throw new ApiError(401, 'Invalid or expired refresh token.');
        }

        const transport = req.body?.refreshToken ? 'body' : 'cookie';
        const data = setRefreshTokenResponse(res, {
            accessToken: createAccessToken(session.userId.toString(), branch),
            tokenType: 'Bearer',
            expiresIn: accessTokenLifetimeSeconds,
        }, transport, nextRefreshToken);

        res.status(200).json(new ApiResponse(200, data, 'Token refreshed successfully'));
    }

    static async logout(req, res) {
        const refreshToken = readRefreshToken(req);
        if (typeof refreshToken === 'string' && refreshToken.length > 0) {
            await RefreshToken.deleteOne({ tokenHash: hashRefreshToken(refreshToken) });
        }
        clearRefreshCookie(res);
        res.status(200).json(new ApiResponse(200, {}, 'Logged out successfully'));
    }

    static async deleteAccount(req, res) {
        const userId = req.user.id;
        const user = await User.findById(userId);
        if (!user) {
            throw new ApiError(404, 'User account was not found.');
        }

        await Promise.all([
            RefreshToken.deleteMany({ userId }),
            Transaction.deleteMany({ userId }),
            ExpenseType.deleteMany({ userId }),
            IncomeType.deleteMany({ userId }),
            PaymentMode.deleteMany({ userId }),
            Branch.deleteMany({ userId }),
        ]);
        const deletedUser = await User.findByIdAndDelete(userId);
        if (!deletedUser) {
            throw new ApiError(404, 'User account was not found.');
        }

        await deleteProfilePhoto(deletedUser.profilePhoto);
        clearRefreshCookie(res);
        res.status(200).json(new ApiResponse(200, {}, 'Account deleted successfully'));
    }

    static async otp(req, res) {
        throw new ApiError(501, 'OTP verification is not implemented yet.');
    }
}

export default AuthController;