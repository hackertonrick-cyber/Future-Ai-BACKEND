import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const { ObjectId } = mongoose.Schema.Types

const patientSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    gender: { type: String, enum: ["male", "female", "other"] },
    dob: { type: Date },
    phone: { type: String, trim: true },
    country: { type: String, trim: true },

    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
    },

    // Emergency & Next of Kin
    nextOfKin: { name: String, relationship: String, phone: String, address: String },
    emergencyContacts: [{ name: String, relationship: String, phone: String, address: String }],

    // Admission Details
    admitted: { type: Boolean, default: false },
    admittedAt: Date,
    dischargedAt: Date,
    admittedBy: { type: ObjectId, ref: "MedicalProfessional" },
    assignedDoctor: { type: ObjectId, ref: "MedicalProfessional" },
    ward: String,
    bedNumber: String,

    // Data Ownership / Consent
    verified: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    consentGiven: { type: Boolean, default: false },
    consentLogs: [{ type: String, orgCode: String, timestamp: Date }],

    // Visit References
    currentVisitId: { type: ObjectId, ref: "PatientVisit" },
    visitHistory: [{ type: ObjectId, ref: "PatientVisit" }],

    // Data Sharing
    publicMedicalProfile: {
      bloodType: String,
      allergies: [String],
      chronicConditions: [String],
      currentMedications: [String],
      lastKnownVitals: {
        temperature: String,
        bloodPressure: String,
        heartRate: String,
      },
    },

    // System Fields
    createdByOrg: String,
    lastUpdatedBy: { type: ObjectId, ref: "OrgUser" },
    deletedRequest: { status: Boolean, requestedAt: Date, completedAt: Date },
    lastLogin: Date,
    loginHistory: [{ ip: String, device: String, timestamp: Date }],
  },
  { timestamps: true }
)

//
// 🔒 Indexing
//
patientSchema.index({ username: 1 }, { unique: true })
patientSchema.index({ email: 1 }, { unique: true })
patientSchema.index({ phone: 1 })
patientSchema.index({ country: 1 })
patientSchema.index({ active: 1 })
patientSchema.index({ "publicMedicalProfile.bloodType": 1 })

//
// 🔑 Password Comparison
//
patientSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash)
}

//
// 🔁 Reset Password
//
patientSchema.methods.resetPassword = async function (newPassword) {
  const salt = await bcrypt.genSalt(12)
  this.passwordHash = await bcrypt.hash(newPassword, salt)
  await this.save()
}

//
// 🧂 Password Hashing Middleware
//
patientSchema.pre("save", async function (next) {
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
// 🧹 Data Sanitization (hide sensitive fields in output)
//
patientSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.passwordHash
    delete ret.__v
    delete ret.deletedRequest
    delete ret.consentLogs
    return ret
  },
})

const Patient = mongoose.model("Patient", patientSchema)
export default Patient