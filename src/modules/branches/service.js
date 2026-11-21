import mongoose from 'mongoose';
import ApiError from '../../utils/ApiError.js';
import User from '../users/model.js';
import Branch from './model.js';

export const isAdmin = (authUser) => authUser.role === 'admin';

// Only the branch name and address belong to the branch; credentials remain on User.
export const createDefaultBranch = async (userId, user) => {
    const branch = await Branch.create({
        userId,
        name: (user.accountType === 'business' && user.organisationName) || user.fullName,
        address: user.address,
    });
    try {
        await User.updateOne(
            { _id: userId, defaultBranchId: null },
            { $set: { defaultBranchId: branch._id } },
        );
    } catch (error) {
        try {
            await branch.deleteOne();
        } catch (cleanupError) {
            throw new AggregateError(
                [error, cleanupError],
                'Default branch creation failed and the branch could not be removed.',
            );
        }
        throw error;
    }
    return branch;
};

export const getDefaultBranchId = async (userId) => {
    const user = await User.findById(userId).select('defaultBranchId');
    if (!user) {
        throw new ApiError(404, 'User account was not found.');
    }
    if (!user.defaultBranchId) {
        throw new ApiError(409, 'This account has no default branch.');
    }
    return user.defaultBranchId.toString();
};

// Resolves the branch a request works on. Branch users are locked to their own branch;
// admins may pick any branch of the account and fall back to the default one.
export const resolveBranchId = async (authUser, branchId) => {
    if (!isAdmin(authUser)) {
        if (branchId && branchId !== authUser.branchId) {
            throw new ApiError(403, 'You can only access your own branch.');
        }
        return authUser.branchId;
    }
    if (!branchId) {
        return getDefaultBranchId(authUser.id);
    }
    if (!mongoose.isValidObjectId(branchId)) {
        throw new ApiError(400, 'Invalid branch ID.');
    }
    const exists = await Branch.exists({ _id: branchId, userId: authUser.id });
    if (!exists) {
        throw new ApiError(400, 'Branch does not belong to the authenticated user.');
    }
    return branchId;
};
