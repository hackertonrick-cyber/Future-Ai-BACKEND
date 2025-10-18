import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const userSchema = mongoose.Schema(
  {
    googleId: {
      type: String,
    },
    kycVerification: {
      type: String,
      enum: ["n/a", "pending", "processing", "verified", "rejected"],
      default: "n/a",
    },
    userName: {
      type: String,
      required: [true, "Username is required."],
      minlength: [3, "Username must be at least 3 characters long."],
      maxlength: [30, "Username cannot exceed 30 characters."],
      trim: true,
    },
    firstName: {
      type: String,
      required: [true, "First name is required."],
      minlength: [3, "First name must be at least 3 characters long."],
      maxlength: [30, "First name cannot exceed 30 characters."],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Last name is required."],
      minlength: [3, "Last name must be at least 3 characters long."],
      maxlength: [30, "Last name cannot exceed 30 characters."],
      trim: true,
    },
    gender: {
      type: String,
      required: true,
      minlength: 3,
      maxlength: 10,
      trim: true,
    },
    dob: {
      type: Date,
      required: [true, "Date of birth is required."],
      validate: {
        validator: function (value) {
          const cutoff = new Date()
          cutoff.setFullYear(cutoff.getFullYear() - 16)
          return value <= cutoff
        },
        message: "User must be at least 16 years old.",
      },
    },
    email: {
      type: String,
      required: [true, "Email is required."],
      maxlength: [50, "Email cannot exceed 50 characters."],
      trim: true,
      lowercase: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address."],
    },
    country: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Countries",
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    accountTier: {
      type: String,
      default: "standard",
    },
    termsCondition: {
      type: Boolean,
      required: true,
      validate: {
        validator: function (value) {
          return value === true // Must accept terms
        },
        message: "You must accept the terms and conditions.",
      },
    },
    newsLetters: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      required: [true, "Password is required."],
      minlength: [6, "Password cannot be less than 6 characters."],
      maxlength: [150, "Password cannot exceed 150 characters."],
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    isAdmin: {
      type: Boolean,
      default: false,
    },
    avatar: {
      type: String,
      trim: true,
      default: () => process.env.LEPRECHAUN_IMAGE,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive"],
    },
    customerId: {
      type: String,
      trim: true,
      default: "",
    },
    shadowBanned: { type: Boolean, default: false },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    banDate: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
)

userSchema.index({ userName: 1 }, { unique: true });
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: "string", $ne: "" } } }
);
userSchema.index({ email: 1 }, { unique: true });

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password
    delete ret.location
    delete ret.shadowBanned
    delete ret.banned
    delete ret.banReason
    delete ret.banDate
    return ret
  },
})

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next()
  }

  try {
    const salt = await bcrypt.genSalt(15)
    this.password = await bcrypt.hash(this.password, salt)

    next()
  } catch (error) {
    next(error)
  }
})

userSchema.methods.resetPassword = async function (newPassword) {
  this.password = newPassword
  await this.save()
}

userSchema.index({ location: "2dsphere" })
const User = mongoose.model("User", userSchema)
export default User