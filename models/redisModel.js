import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const redisSchema = mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }, // auto-delete after 5 mins
    // expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
)

// redisSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
redisSchema.pre("save", async function (next) {
  if (!this.isModified("value")) return next()

  // If value is a string (e.g. a raw OTP), hash it
  if (typeof this.value === "string") {
    const salt = await bcrypt.genSalt(12)
    this.value = await bcrypt.hash(this.value, salt)
  }

  next()
})

redisSchema.methods.verifyCode = async function (candidateValue) {
  if (typeof this.value !== "string") return false
  return bcrypt.compare(candidateValue, this.value)
}

const Redis = mongoose.model("Redis", redisSchema)
export default Redis
