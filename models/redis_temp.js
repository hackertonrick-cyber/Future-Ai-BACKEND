import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const redisSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }, // auto-delete after 5 mins
  },
  { timestamps: true }
)

// Optional hashing: only applies if value is a string (e.g., OTP or token)
redisSchema.pre("save", async function (next) {
  if (!this.isModified("value")) return next()
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

const RedisTemp = mongoose.model("RedisTemp", redisSchema)
export default RedisTemp