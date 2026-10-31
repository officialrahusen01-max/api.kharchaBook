import mongoose from 'mongoose';

const createMasterModel = (modelName) => {
    const schema = new mongoose.Schema({
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
    }, {
        timestamps: true,
        versionKey: false,
    });

    schema.index({ userId: 1, name: 1 }, { unique: true });

    return mongoose.models[modelName] || mongoose.model(modelName, schema);
};

export const ExpenseType = createMasterModel('ExpenseType');
export const IncomeType = createMasterModel('IncomeType');
export const PaymentMode = createMasterModel('PaymentMode');

export default { ExpenseType, IncomeType, PaymentMode };
