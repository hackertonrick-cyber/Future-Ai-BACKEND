import mongoose from "mongoose";

const spendSchema = mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    amountSpent: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "withdraw_fee",
        "system_fee",
        "custom"
      ],
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible JSON for metadata
      default: {},
    }
  },
  { timestamps: true }
);

const SpendLog = mongoose.model("SpendLog", spendSchema);
export default SpendLog;