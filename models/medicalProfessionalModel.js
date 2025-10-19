import mongoose from "mongoose"

const medicalProfessionalSchema = new mongoose.Schema(
  {
    // 🔹 Personal Details
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["male", "female", "other"], default: "other" },
    dob: { type: Date },

    // 🔹 Professional Information
    profession: {
      type: String,
      enum: ["doctor", "nurse", "technician", "therapist", "pharmacist", "admin"],
      required: true,
    },
    specialization: { type: String },
    licenseNumber: { type: String },
    licenseAuthority: { type: String },
    qualification: { type: String },
    yearsOfExperience: { type: Number, default: 0 },

    // 🔹 Organizational Link
    companyCode: { type: String, required: true },
    branchCode: { type: String },
    orgUserId: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser", required: true },

    // 🔹 Contact & Account
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String },
    active: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
  },
  { timestamps: true }
)

const MedicalProfessional = mongoose.model("MedicalProfessional", medicalProfessionalSchema)
export default MedicalProfessional