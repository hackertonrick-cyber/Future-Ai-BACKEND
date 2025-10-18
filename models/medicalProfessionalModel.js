import mongoose from "mongoose"

const medicalProfessionalSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    gender: String,
    dob: Date,
    profession: { enum: ["doctor", "nurse", "technician", "therapist", "pharmacist", "admin"] },
    specialization: String,
    licenseNumber: String,
    licenseAuthority: String,
    qualification: String,
    yearsOfExperience: Number,
    companyCode: String,
    branchCode: String,
    orgUserId: ObjectId, // link to OrgUser
    email: String,
    phone: String,
    active: Boolean,
    verified: Boolean,
    createdAt: Date,
    updatedAt: Date,
  },
  { timestamps: true }
)

const MedicalProfessional = mongoose.model("MedicalProfessional", medicalProfessionalSchema)
export default MedicalProfessional
