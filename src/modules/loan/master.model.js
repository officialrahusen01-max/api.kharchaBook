import mongoose from "mongoose";

const createMasterModel = (modelName) => {
  const schema = new mongoose.Schema(
    {
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      personName: { type: String, required: true, trim: true },
      amount: { type: Number, required: true },
      status: {
        type: String,
        enum: ["payable", "receivable"],
        required: true,
      },
      date: { type: Date, required: true, default: Date.now },
      dueDate: { type: Date },
      phoneNumber: {
        type: String,
        required: true,
        trim: true,
        match: [/^[0-9]{10}$/, "Invalid phone number"],
      },
      description: { type: String, trim: true },
      settledAmount: { type: Number, default: 0, min: 0 },
      isSettled: { type: Boolean, default: false },
    },
    { timestamps: true, versionKey: false },
  );

  schema.index({ userId: 1, status: 1, date: -1 });

  return mongoose.models[modelName] || mongoose.model(modelName, schema);
};

export default createMasterModel;
