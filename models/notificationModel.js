import mongoose from "mongoose"

const notificationSchema = new mongoose.Schema(
  {
    // 🔹 Recipient Context
    recipient: {
      _id: { type: mongoose.Schema.Types.ObjectId, required: true },
      model: {
        type: String,
        enum: ["Patient", "OrgUser", "Organization"],
        required: true,
      }, // Determines which collection to reference dynamically
      companyCode: { type: String },
      branchCode: { type: String },
    },

    // 🔹 Sender Context
    sender: {
      _id: { type: mongoose.Schema.Types.ObjectId, refPath: "sender.model" },
      userName: { type: String },
      avatar: { type: String },
      model: { type: String, enum: ["Patient", "OrgUser", "System"], default: "System" },
    },

    // 🔹 Notification Core
    subject: {
      type: String,
      required: [true, "Notification subject is required."],
    },
    message: {
      type: String,
      required: [true, "Notification message is required."],
    },
    type: {
      type: String,
      enum: [
        "access_request",
        "access_approved",
        "access_denied",
        "access_revoked",
        "appointment",
        "vital_update",
        "system_alert",
        "welcome",
      ],
      default: "system_alert",
    },

    // 🔹 Action Buttons (UI or Email)
    actions: [
      {
        text: { type: String, required: true },
        url: { type: String, required: true },
        params: { type: Object },
        _id: { type: String },
      },
    ],

    // 🔹 Status & Lifecycle
    status: {
      type: String,
      enum: ["viewed", "not_viewed", "archived"],
      default: "not_viewed",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high"],
      default: "normal",
    },
    expiresAt: { type: Date, default: null },

    // 🔹 Audit Trail
    orgContext: {
      companyCode: { type: String },
      branchCode: { type: String },
      relatedEntity: { type: mongoose.Schema.Types.ObjectId, refPath: "relatedEntityModel" },
      relatedEntityModel: { type: String, enum: ["Patient", "AccessRequest", "Appointment", null] },
    },

    readAt: { type: Date },
    archivedAt: { type: Date },
  },
  { timestamps: true }
)

notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
notificationSchema.index({ "recipient._id": 1, status: 1 })
notificationSchema.index({ "recipient.model": 1 })
notificationSchema.index({ "orgContext.companyCode": 1 })

const Notification = mongoose.model("Notification", notificationSchema)
export default Notification