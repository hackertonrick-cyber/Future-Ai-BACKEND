import mongoose from "mongoose"

const appointmentSchema = new mongoose.Schema(
  {
    // 🔹 Core Relationships
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    requesterProfessionalId: { type: mongoose.Schema.Types.ObjectId, ref: "MedicalProfessional", required: true },
    orgCode: { type: String, required: true }, // hospital or clinic
    branchCode: { type: String },

    // 🔹 Appointment Details
    appointmentDate: { type: Date, required: true }, // scheduled time
    durationMinutes: { type: Number, default: 30 },
    reasonForVisit: { type: String },
    visitType: { 
      type: String, 
      enum: ["in_person", "virtual", "follow_up", "consultation"], 
      default: "in_person" 
    },
    priority: { 
      type: String, 
      enum: ["normal", "urgent", "emergency"], 
      default: "normal" 
    },

    // 🔹 Status Workflow
    status: { 
      type: String, 
      enum: [
        "scheduled",     // created, awaiting visit
        "confirmed",     // confirmed by doctor or staff
        "checked_in",    // patient arrived
        "in_progress",   // visit in session
        "completed",     // visit concluded
        "cancelled",     // cancelled by patient or doctor
        "no_show"        // patient didn’t appear
      ],
      default: "scheduled"
    },

    // 🔹 Link to Actual Visit Record
    visitId: { type: mongoose.Schema.Types.ObjectId, ref: "PatientVisit" }, // created when check-in occurs

    // 🔹 Administrative Fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" }, // receptionist/admin who booked it
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    // 🔹 Access Control (optional, same pattern)
    restrictedAccess: {
      doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: "MedicalProfessional" }],
      organizations: [{ type: String }]
    },

    // 🔹 Communication / Notification Tracking
    notifications: [
      {
        type: { type: String, enum: ["email", "sms", "system"] },
        sentAt: Date,
        message: String
      }
    ],

    // 🔹 Cancellation or Rescheduling
    cancellation: {
      cancelledBy: { type: String, enum: ["patient", "doctor", "admin"] },
      cancelledAt: Date,
      reason: String
    },
    rescheduled: {
      previousDate: Date,
      rescheduledBy: { type: String, enum: ["patient", "doctor", "admin"] },
      rescheduledAt: Date
    }
  },
  { timestamps: true }
)

const Appointment = mongoose.model("Appointment", appointmentSchema)
export default Appointment