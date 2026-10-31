import mongoose from 'mongoose';
import addressSchema from './address.model.js';
import { branchRoles } from '../../validators/common.js';

const branchSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 80,
    },
    description: {
        type: String,
        trim: true,
        maxlength: 200,
        default: '',
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true,
        unique: true,
    },
    passwordHash: {
        type: String,
        required: true,
        select: false,
    },
    role: {
        type: String,
        enum: branchRoles,
        default: 'user',
    },
    email: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254,
        default: null,
    },
    address: {
        type: addressSchema,
        default: null,
    },
}, {
    timestamps: true,
    versionKey: false,
});

branchSchema.index({ userId: 1, name: 1 }, { unique: true });

const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

export default Branch;
