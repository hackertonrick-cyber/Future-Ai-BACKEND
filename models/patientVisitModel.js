import mongoose from "mongoose"

const patientVisitSchema = new mongoose.Schema(
  {
    patientId: ObjectId,
  orgCode: String,
  branchCode: String,
  doctorId: ObjectId,            // MedicalProfessional
  attendingNurses: [ObjectId],
  consultingDoctors: [ObjectId],
  visitDate: Date,
  reasonForVisit: String,
  status: { enum: ["checked_in", "in_progress", "completed", "cancelled"] },
  notes: [
    {
      addedBy: ObjectId,         // MedicalProfessional
      noteType: { enum: ["doctor", "nurse", "admin"] },
      content: String,
      timestamp: Date
    }
  ],
  prescriptions: [
    {
      medicine: String,
      dosage: String,
      duration: String,
      issuedBy: ObjectId,        // MedicalProfessional
      issuedAt: Date
    }
  ],
  followUp: { date: Date, reason: String, assignedTo: ObjectId },

  // Access Control
  restrictedAccess: {
    doctors: [ObjectId],         // allowed professionals
    organizations: [String]
  },

  createdBy: ObjectId,           // OrgUser
  lastUpdatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
  },
  { timestamps: true }
)

const PatientVisit = mongoose.model("PatientVisit", patientVisitSchema)
export default PatientVisit