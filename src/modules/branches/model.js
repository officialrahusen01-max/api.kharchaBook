import mongoose from 'mongoose';
import addressSchema from './address.model.js';

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
    address: {
        type: addressSchema,
        required: true,
    },
}, {
    timestamps: true,
    versionKey: false,
});

branchSchema.index({ userId: 1, name: 1 }, { unique: true });

const Branch = mongoose.models.Branch || mongoose.model('Branch', branchSchema);

export default Branch;
