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
        required: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
        unique: true,
    },
    gender: {
        type: String,
        required: true,
        trim: true,
        maxlength: 30,
    },
    dob: {
        type: Date,
        required: true,
    },
    profilePhoto: {
        type: String,
        trim: true,
        maxlength: 500,
        default: null,
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
            return result;
        },
    },
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

export default User;
