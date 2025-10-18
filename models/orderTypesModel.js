import mongoose from "mongoose"

const orderTypesSchema = mongoose.Schema(
  {
    orderType: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    API_ID: {
      type: String,
      required: true,
    },
    cost: {
      type: Number,
      required: true,
      min: [0, 'Cost cannot be negative'],
    },
    value: {
      type: Number,
      required: true,
      min: [0, 'Cost cannot be negative'],
    },
    description: {
      type: String,
      default: null
    },
    taxPrice: {
      type: Number,
      required: true,
      trim: true,
      default: 0.0,
      min: [0, 'Tax price cannot be negative'],
    },
    status: { 
      type: String, 
      enum: ["active", "inactive"], 
      default: "active", 
    }, // Soft delete
    createdBy: { type: String, trim: true, minlength: 3, maxlength: 50 },
    updatedBy: { type: String, trim: true, minlength: 3, maxlength: 50 },
  },
  {
    timestamps: true,
  }
)

orderTypesSchema.virtual("isDeleted").get(function () {
  return this.status === "inactive";
});
const OrderTypes = mongoose.model("OrderTypes", orderTypesSchema)
export default OrderTypes
