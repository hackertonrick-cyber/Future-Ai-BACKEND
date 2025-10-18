import mongoose from "mongoose"

const AuditEventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true }, // e.g., 'status.updated', 'data.updated'
    occurredAt: { type: Date, required: true },
    status: { type: String, required: true }, // your normalized status
  },
  { _id: false }
)

const KycAuditSchema = new mongoose.Schema(
  {
    provider: {
      name: { type: String, default: "didit" },
      version: { type: String, default: "v2" },
    },
    diditSessionId: { type: String },
    idempotencyKey: { type: String },
    hostedUrl: { type: String },
    embedToken: { type: String },
    lastEventId: { type: String, index: true }, // for idempotency on webhooks
    lastEventType: { type: String },
    lastEventAt: { type: Date },
    events: { type: [AuditEventSchema], default: [] },
  },
  { _id: false }
)

const OutcomeSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["created", "pending", "user_in_progress", "needs_review", "verified", "failed", "expired", "canceled"],
      default: "created",
      index: true,
    },
    summary: {
      docType: { type: String },
      issuingCountry: { type: String },
      idMatchScore: { type: Number, min: 0, max: 1 },
      livenessScore: { type: Number, min: 0, max: 1 },
      extractedFirstName: { type: String },
      extractedLastName: { type: String },
      extractedDob: { type: String },
      addressVerified: { type: Boolean, default: false },
      addressLine1: { type: String },
      addressLine2: { type: String },
      city: { type: String },
      region: { type: String },
      postalCode: { type: String },
      country: { type: String },
    },
    aml: {
      screened: { type: Boolean, default: false },
      pep: { type: Boolean, default: false },
      sanctionsHit: { type: Boolean, default: false },
      watchlists: [{ type: String }],
      hits: [
        {
          list: String,
          reference: String,
          score: Number,
        },
      ],
    },
    reasonCodes: [{ type: String }],
  },
  { _id: false }
)

const ManualReviewSchema = new mongoose.Schema(
  {
    required: { type: Boolean, default: false },
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, default: "" },
    reviewedAt: { type: Date },
  },
  { _id: false }
)

const KycSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    personalInfo: {
      firstName: { type: String },
      lastName: { type: String },
      dob: {
        type: String, // YYYY-MM-DD
        validate: {
          validator: (value) => {
            if (!value) return true
            const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
            return isoDateRegex.test(value)
          },
          message: "Please enter a valid date (YYYY-MM-DD).",
        },
      },
      gender: { type: String },
      country: { type: String },
    },
    services: {
      type: [{ type: String, enum: ["id", "biometrics", "aml", "poa"] }],
      default: ["id", "biometrics", "aml", "poa"],
      index: true,
    },
    outcome: { type: OutcomeSchema, default: () => ({}) },
    audit: KycAuditSchema,
    manualReview: { type: ManualReviewSchema, default: () => ({}) },
    retriesUsed: { type: Number, default: 0 },
    retriesAllowed: { type: Number, default: 2 },

    // Backward-compat shim (maps to outcome.status)
    status: {
      type: String,
      enum: ["created", "pending", "user_in_progress", "needs_review", "verified", "failed", "expired", "canceled"],
      default: "created",
      index: true,
    },
  },
  { timestamps: true }
)

KycSchema.pre("save", function (next) {
  if (this.outcome?.status && this.status !== this.outcome.status) {
    this.status = this.outcome.status
  }
  next()
})

KycSchema.index({ user: 1, createdAt: -1 })
KycSchema.index({ "audit.diditSessionId": 1 }, { unique: true, sparse: true })
KycSchema.index({ status: 1, updatedAt: -1 })

const KYC = mongoose.model("Kyc", KycSchema)
export default KYC
