import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const orgUserSchema = new mongoose.Schema(
  {
    // 🔹 Organizational context
    companyCode: { type: String, required: true },
    branchCode: { type: String, required: true },

    // 🔹 User credentials & role
    username: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "doctor", "nurse", "super-admin", "technician"], required: true },

    // 🔹 Audit & control
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)

//
// 🔒 Indexing
//
orgUserSchema.index({ username: 1, companyCode: 1 }, { unique: true }) // ensures unique username per company
orgUserSchema.index({ companyCode: 1 })
orgUserSchema.index({ branchCode: 1 })

//
// 🔒 Password Comparison
//
orgUserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash)
}

//
// 🔒 Password Hashing Middleware
//
orgUserSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt)
    next()
  } catch (error) {
    next(error)
  }
})

//
// 🔁 Reset Password Method
//
orgUserSchema.methods.resetPassword = async function (newPassword) {
  const salt = await bcrypt.genSalt(12)
  this.passwordHash = await bcrypt.hash(newPassword, salt)
  await this.save()
}

//
// 🔐 Data Sanitization (output)
//
orgUserSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash
    delete ret.__v
    return ret
  },
})

const OrgUser = mongoose.model("OrgUser", orgUserSchema)
export default OrgUser