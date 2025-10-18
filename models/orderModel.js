import mongoose from "mongoose"
import moment from "moment"

const quarterlyOrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    userSnapshot: {
      userId: { type: mongoose.Schema.Types.ObjectId, trim: true },
      userName: { type: String, trim: true },
      email: { type: String, trim: true },
      accountTier: { type: String, trim: true },
    },
    adminTags: {
      type: [String],
      default: [],
      enum: [
        "vip",
        "manual-review",
        "suspicious",
        "flagged",
        "referral",
        "test",
        "high-value"
      ],
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      set: (val) => val.toUpperCase(),
      default: "USD",
      enum: ["USD", "USDT", "ETH", "BTC", "BNB", "ADA", "XRP"],
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    purchaseType: {
      type: String,
      enum: ["COINS", "PACK", "MISC"],
      required: true,
    },
    purchaseMeta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    costBeforeTax: {
      type: Number,
      required: true,
      min: [0, "Cost before tax cannot be negative"],
    },
    taxAmount: {
      type: Number,
      required: true,
      default: 0.0,
      min: [0, "Tax amount cannot be negative"],
    },
    totalPrice: {
      type: Number,
      required: true,
      default: 0.0,
      min: [0, "Total price cannot be negative"],
    },
    isPaid: {
      type: Boolean,
      required: true,
      default: false,
    },
    paidAt: Date,
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    paymentIntentId: {
      type: String,
      trim: true,
    },
    receiptUrl: {
      type: String,
      required: true,
      trim: true,
      default: "n/a",
    },
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid", "refunded", "failed", "pending"],
      default: "unpaid",
    },
    isRefunded: {
      type: Boolean,
      default: false,
    },
    refundReason: {
      type: String,
      trim: true,
    },
    refundAt: Date,
    notes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "cancelled", "expired", "complete"],
      default: "active",
    },
    ipAddress: String,
    userAgent: String,
    location: String,
  },
  { timestamps: true }
)

const orderSchema = new mongoose.Schema(
  {
    month: {
      type: String,
      required: true,
      immutable: true,
      default: () => moment().format("YYYY-MM"),
    },
    orderType: {
      type: String,
      required: true,
      ref: "OrderTypes",
    },
    quarterlyOrder: [quarterlyOrderSchema],
  },
  { timestamps: true }
)

const Order = mongoose.model("Order", orderSchema)
export default Order
