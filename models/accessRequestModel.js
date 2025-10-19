import mongoose from "mongoose"

const accessRequestSchema = new mongoose.Schema(
  {
    // 🔹 Core Relationships
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    requesterProfessionalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MedicalProfessional",
      required: true,
    },

    // 🔹 Requester Org Context
    requesterOrgCode: { type: String, required: true },
    requesterBranchCode: { type: String },

    // 🔹 Access Categories & Reasons
    requestedCategories: [
      {
        category: {
          type: String,
          enum: ["visits", "vitals", "diagnosis", "prescriptions", "labResults", "imaging", "notes"],
          required: true,
        },
        reason: { type: String, trim: true },
      },
    ],

    // 🔹 Administrative & Audit
    justification: { type: String, trim: true },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "revoked"],
      default: "pending",
    },

    // 🔹 Approval & Review Fields
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },
    approvedOrgCode: { type: String },
    targetOrgCode: { type: String },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },
    rejectedAt: { type: Date },

    // 🔹 Lifecycle Management
    expiresAt: { type: Date },
    autoGranted: { type: Boolean, default: false },
    reviewerNote: { type: String, trim: true },

    // 🔹 Request Metadata
    requestedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const AccessRequest = mongoose.model("AccessRequest", accessRequestSchema)
export default AccessRequest