import ApiError from '../../utils/ApiError.js';
import ApiResponse from '../../utils/ApiResponse.js';
import User from './model.js';
import profileUpdateSchema from './profile.schema.js';
import { deleteProfilePhoto, saveProfilePhoto } from './profilePhoto.js';

const publicProfile = (user) => ({
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
    profilePhoto: user.profilePhoto,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

class UserController {
    static async getProfile(req, res) {
        const user = await User.findById(req.user.id);
        if (!user) {
            throw new ApiError(404, 'User profile was not found.');
        }

        res.status(200).json(new ApiResponse(200, publicProfile(user), 'Profile retrieved successfully'));
    }

    static async updateProfile(req, res) {
        const parsed = profileUpdateSchema.safeParse(req.body);
        if (!parsed.success) {
            const issues = parsed.error.issues.map(({ path, code, message }) => ({
                path,
                code,
                message,
            }));
            throw new ApiError(400, 'Invalid profile update data.', issues);
        }

        const updates = parsed.data;
        if (Object.keys(updates).length === 0) {
            throw new ApiError(400, 'Provide at least one profile field to update.');
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            throw new ApiError(404, 'User profile was not found.');
        }

        Object.assign(user, updates);
        if (updates.dob) user.dob = new Date(`${updates.dob}T00:00:00.000Z`);
        if (user.accountType !== 'business') {
            if (updates.organisationName) {
                throw new ApiError(400, 'Organisation name can only be set for business accounts.');
            }
            user.organisationName = null;
        } else if (!user.organisationName) {
            throw new ApiError(400, 'Organisation name is required for business accounts.');
        }
        await user.save();

        res.status(200).json(new ApiResponse(200, publicProfile(user), 'Profile updated successfully'));
    }

    static async updateProfilePhoto(req, res) {
        if (!req.file) {
            throw new ApiError(400, 'A profilePhoto image file must be provided.');
        }
        if (Object.keys(req.body ?? {}).length > 0) {
            throw new ApiError(400, 'Only the profilePhoto file is accepted by this endpoint.');
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            throw new ApiError(404, 'User profile was not found.');
        }

        const previousPhotoPath = user.profilePhoto;
        const uploadedPhoto = await saveProfilePhoto(req.file);
        user.profilePhoto = uploadedPhoto.path;

        try {
            await user.save();
        } catch (error) {
            try {
                await deleteProfilePhoto(uploadedPhoto.path);
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    'Profile photo update failed and the uploaded photo could not be cleaned up.',
                );
            }
            throw error;
        }

        if (previousPhotoPath && previousPhotoPath !== uploadedPhoto.path) {
            await deleteProfilePhoto(previousPhotoPath);
        }

        res.status(200).json(new ApiResponse(200, publicProfile(user), 'Profile photo updated successfully'));
    }
}

export default UserController;
