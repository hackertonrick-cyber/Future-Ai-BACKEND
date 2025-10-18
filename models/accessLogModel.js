import mongoose from "mongoose"

const accessLogSchema = new mongoose.Schema(
  {
    patientId: ObjectId,
    recordType: { enum: ["visit", "vitals", "profile", "lab", "notes"] },
    recordId: ObjectId,
    accessedBy: ObjectId, // MedicalProfessional
    orgCode: String,
    action: { enum: ["view", "update", "share", "revoke"] },
    timestamp: Date,
    ip: String,
  },
  { timestamps: true }
)

const AccessLog = mongoose.model("AccessLog", accessLogSchema)
export default AccessLog