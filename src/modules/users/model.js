import mongoose from 'mongoose';
import addressSchema from '../branches/address.model.js';
import { accountTypes } from '../../validators/common.js';

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100,
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        unique: true,
        sparse: true,
    },
    gender: {
        type: String,
        trim: true,
        maxlength: 30,
        default: '',
    },
    dob: {
        type: Date,
        default: null,
    },
    profilePhoto: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
    },
    softPassword: {
        type: String,
        trim: true,
        maxlength: 4,
        default: null,
        select: false,
    },
    passwordHash: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,
        enum: ['admin', 'user'],
        default: 'user',
        required: true,
    },
    ownerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    branchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        default: null,
        index: true,
    },
    accountType: {
        type: String,
        enum: accountTypes,
        default: 'self',
    },
    organisationName: {
        type: String,
        trim: true,
        maxlength: 120,
        default: null,
    },
    address: {
        type: addressSchema,
        default: null,
    },
    defaultBranchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Branch',
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
    toJSON: {
        transform: (document, result) => {
            result.id = result._id.toString();
            delete result._id;
            delete result.passwordHash;
            delete result.softPassword;
            return result;
        },
    },
});

userSchema.index(
    { ownerUserId: 1, branchId: 1 },
    { unique: true, partialFilterExpression: { role: 'user', branchId: { $type: 'objectId' } } },
);

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
