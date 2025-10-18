import mongoose from "mongoose"

const patientVitalsSchema = new mongoose.Schema(
  {
    patientId: ObjectId,
    visitId: ObjectId,
    orgCode: String,
    branchCode: String,
    recordedBy: ObjectId, // MedicalProfessional
    temperature: String,
    bloodPressure: String,
    heartRate: String,
    respirationRate: String,
    oxygenSaturation: String,
    glucose: String,
    weight: String,
    height: String,
    bmi: String,
    notes: String,

    // Access Control
    restrictedAccess: {
      doctors: [ObjectId],
      organizations: [String],
    },

    recordedAt: Date,
    createdAt: Date,
    updatedAt: Date,
  },
  { timestamps: true }
)

const PatientVitals = mongoose.model("PatientVitals", patientVitalsSchema)
export default PatientVitals
