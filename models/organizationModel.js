import mongoose from "mongoose"

const organizationSchema = new mongoose.Schema(
  {
    // 🔹 Core Identification
    companyCode: { type: String, required: true, unique: true }, // e.g., HSP001
    companyName: { type: String, required: true, trim: true },
    country: { type: String, required: true },
    address: { type: String },
    contactEmail: { type: String, lowercase: true },
    contactPhone: { type: String },
    website: { type: String },

    // 🔹 Branches
    branches: [
      {
        branchCode: { type: String, required: true }, // e.g., BR001
        branchName: { type: String, required: true },
        address: { type: String },
        phone: { type: String },
        email: { type: String },
        active: { type: Boolean, default: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // 🔹 Ownership / Administration
    primaryAdminUser: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },
    primaryContactPerson: {
      name: String,
      email: String,
      phone: String,
      position: String,
    },

    // 🔹 Registration & Verification Workflow
    registrationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },

    // 🔹 Invite / Pre-Registration Data
    inviteToken: { type: String }, // hashed token for private invite link
    inviteSentTo: { type: String }, // email the invite was sent to
    inviteSentAt: { type: Date },
    inviteAcceptedAt: { type: Date },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" },

    // 🔹 Compliance / Legal Details
    licenseNumber: { type: String },
    accreditationBody: { type: String },
    licenseExpiry: { type: Date },
    documents: [
      {
        name: String, // e.g., “Medical License”, “Business Cert”
        url: String, // Wasabi or Cloud Storage URL
        uploadedAt: Date,
        verified: Boolean,
      },
    ],

    // 🔹 Internal Controls
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "OrgUser" }, // superadmin
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

const Organization = mongoose.model("Organization", organizationSchema)
export default Organization