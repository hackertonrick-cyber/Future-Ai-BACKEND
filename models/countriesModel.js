import mongoose from "mongoose";

const countriesSchema = mongoose.Schema(
  {
    countryId: {
      type: String,
      required: [true, 'Country ID is required'], 
      unique: [true, 'Country ID must be unique'],
    },
    description: {
      type: String,
      trim: true,
      required: [true, 'Description is required'],
      unique: [true, 'Description must be unique'],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Created by is required'], 
      ref: "User",
    },
  },
  { timestamps: true }
);

const Countries = mongoose.model("Countries", countriesSchema);
export default Countries;
