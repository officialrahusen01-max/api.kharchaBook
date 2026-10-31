import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
    line1: { type: String, required: true, trim: true, maxlength: 200 },
    line2: { type: String, trim: true, maxlength: 200, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 10 },
    country: { type: String, trim: true, maxlength: 80, default: 'India' },
}, {
    _id: false,
});

export default addressSchema;
