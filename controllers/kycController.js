import crypto from "crypto"
import asyncHandler from "express-async-handler"
import { generateMongoDBObjectId, mapDiditStatus } from "../utils/constants.js"
import KYC from "../models/kycModel.js"
import mongoose from "mongoose"
import { privateNamespace } from "../utils/socket.js"
import User from "../models/userModel.js"

// Didit headers & timing
const SIGNATURE_HEADER = "x-signature"
const TIMESTAMP_HEADER = "x-timestamp"
const MAX_SKEW_SECONDS = 300 // 5 minutes

const mapStatusToUserFlag = (s) => {
  const v = String(s || "").toLowerCase()
  if (["verified"].includes(v)) return "verified"
  if (["user_in_progress", "needs_review", "pending", "created"].includes(v)) {
    // pending/created -> show 'pending'; active flows -> 'processing'
    return v === "user_in_progress" || v === "needs_review" ? "processing" : "pending"
  }
  if (["failed", "rejected", "declined", "canceled", "cancelled", "expired", "error"].includes(v)) {
    return "rejected" // change to 'n/a' if you prefer not to mark failures as rejected
  }
  return "pending"
}

const normalizeStatus = (s) => {
  switch ((s || "").toLowerCase()) {
    case "created":
      return "created"
    case "in_progress":
      return "user_in_progress"
    case "pending":
      return "pending"
    case "pending_review":
      return "needs_review"
    case "approved":
    case "completed":
    case "verified":
      return "verified"
    case "failed":
    case "rejected":
      return "failed"
    case "expired":
      return "expired"
    case "canceled":
      return "canceled"
    default:
      return "pending"
  }
}

// Small helper to build an idempotent event key
const buildEventKey = (evt) => {
  // Didit doesn’t include an explicit event id in docs; compose one
  // using session_id + webhook_type + created_at (or timestamp)
  const created = evt.created_at || evt.timestamp || Date.now()
  return `${evt.session_id}:${evt.webhook_type}:${created}`
}

// Safely extract a tiny summary for your UI (optional)
const extractSummary = (evt) => {
  const decision = evt?.decision || {}
  const idv = decision?.id_verification || {}
  return {
    docType: idv.document_type || undefined,
    issuingCountry: idv.issuing_state || idv.issuing_state_name || undefined,
    extractedFirstName: idv.first_name || decision?.expected_details?.first_name || undefined,
    extractedLastName: idv.last_name || decision?.expected_details?.last_name || undefined,
    extractedDob: idv.date_of_birth || undefined,
    addressVerified: Boolean(decision?.proof_of_address?.status === "Approved"),
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// helper: fetch Didit decision with small budget (don’t block your API)
const fetchDecisionOnce = async (sessionId, { base, apiKey, timeoutMs = 1200 } = {}) => {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  let text = ""
  try {
    const r = await fetch(`${base.replace(/\/+$/, "")}/session/${encodeURIComponent(sessionId)}/decision/`, {
      method: "GET",
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    })
    text = await r.text().catch(() => "")
    if (!r.ok) {
      const e = new Error(`decision ${r.status}: ${text?.slice(0, 200)}`)
      e.status = r.status
      throw e
    }
    return text ? JSON.parse(text) : {}
  } finally {
    clearTimeout(t)
  }
}
const TERMINAL_STATUSES = new Set(["approved", "declined", "rejected", "failed", "completed", "canceled", "cancelled"])
const isTerminal = (s) => TERMINAL_STATUSES.has(String(s || "").toLowerCase())
//#region @desc Create a new DidIt verification session (hosted by default)
// @route POST /api/kyc/session
// @access Private
const startKycSession = asyncHandler(async (req, res) => {
  const userId = req.user._id
  const { mode = "hosted", language = "en" } = req.body

  const DID_IT_BASE = process.env.DID_IT_BASE
  const DID_IT_KEY = process.env.DID_IT_KEY
  const DID_IT_WORKFLOW_ID = process.env.DID_IT_WORKFLOW_ID
  if (!DID_IT_BASE || !DID_IT_KEY) throw new Error("KYC misconfiguration: DID_IT_BASE or DID_IT_KEY missing")
  if (!DID_IT_WORKFLOW_ID) throw new Error("KYC misconfiguration: DIDIT_WORKFLOW_ID missing")

  const frontBase = process.env.FRONT_URL || process.env.APP_BASE_URL || ""
  const idemKey = String(generateMongoDBObjectId())

  // ---------- 1) Create session (HTTP, outside txn) ----------
  const payload = {
    reference_id: String(userId),
    workflow_id: DID_IT_WORKFLOW_ID,
    delivery: mode === "embed" ? "embedded" : "hosted",
    success_url: `${frontBase}/kyc/success`,
    cancel_url: `${frontBase}/kyc/cancel`,
    contact_details: { email: req.user.email, email_lang: language },
    // expected_details: { date_of_birth: req.user.dob },
  }

  const createUrl = `${DID_IT_BASE.replace(/\/+$/, "")}/session/`
  const headers = {
    "X-Api-Key": DID_IT_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Idempotency-Key": idemKey,
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 15000)
  let resp,
    rawText = ""
  try {
    resp = await fetch(createUrl, { method: "POST", headers, body: JSON.stringify(payload), signal: controller.signal })
    rawText = await resp.text().catch(() => "")
  } catch (e) {
    clearTimeout(t)
    if (e?.name === "AbortError") throw new Error("DidIt create session failed: timeout")
    throw new Error(`DidIt create session failed: ${e?.message || "network error"}`)
  }
  clearTimeout(t)

  if (!resp.ok) {
    const reqId = resp.headers.get("x-request-id") || null
    if (resp.status === 403) {
      return res.status(502).json({
        code: "kyc_provider_forbidden",
        message: "Provider rejected session creation for this workflow_id.",
        reqId,
        hints: [
          "Verify key environment (test vs prod) matches DID_IT_BASE.",
          "Confirm the workflow is active and your key is entitled to it.",
          "If using embedded, ensure the account is enabled for it.",
        ],
        provider_body: rawText?.slice(0, 400) || resp.statusText,
      })
    }
    throw new Error(`DidIt error ${resp.status}: ${rawText || resp.statusText}`)
  }

  // Extract hosted URL + session id (prefer body, fallback to Location header + decode)
  let data = {}
  try {
    data = rawText ? JSON.parse(rawText) : {}
  } catch {}
  const locationHeader = resp.headers.get("location") || null

  let diditSessionId = data.session_id || data.id || data.data?.session_id || null
  let hostedUrl = data.url || data.hosted_url || data.links?.hosted || locationHeader || null

  if (!diditSessionId && locationHeader) {
    try {
      const token = locationHeader.split("/").pop()
      const payloadB64 = token.split(".")[1]
      const payloadJSON = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
      if (payloadJSON?.session_id) diditSessionId = payloadJSON.session_id
    } catch {}
  }

  const primeStatus = normalizeStatus(data.status || "pending")

  // ---------- 2) Quick decision prime (HTTP, outside txn) ----------
  let decision = null
  if (diditSessionId) {
    for (let i = 0; i < 2; i++) {
      try {
        decision = await fetchDecisionOnce(diditSessionId, { base: DID_IT_BASE, apiKey: DID_IT_KEY, timeoutMs: 1200 })
        break
      } catch (e) {
        if (e.status !== 404) break
        await sleep(250 * (i + 1))
      }
    }
  }

  const decisionStatus = decision?.status ? normalizeStatus(decision.status) : primeStatus
  const checksPreview = {
    id_verification: decision?.id_verification?.status || null,
    nfc: decision?.nfc?.status || null,
    liveness: decision?.liveness?.status || null,
    face_match: decision?.face_match?.status || null,
    aml: decision?.aml?.status || null,
    poa: decision?.poa?.status || null,
  }

  // ---------- 3) Persist in ONE short transaction ----------
  const session = await mongoose.startSession()
  let docId
  try {
    await session.withTransaction(
      async () => {
        // If you want to ensure only one active KYC per user, you can add an upsert+unique index
        const docData = {
          user: userId,
          services: [],
          status: decisionStatus,
          outcome: { status: decisionStatus },
          audit: {
            provider: { name: "didit", version: "v2" },
            diditSessionId: diditSessionId || null,
            idempotencyKey: idemKey,
            hostedUrl: hostedUrl || null,
            embedToken: data.embed_token || null,
            events: [],
            decisionSnapshot: decision
              ? {
                  status: decision?.status,
                  workflow_id: decision?.workflow_id,
                  features: decision?.features || [],
                }
              : undefined,
          },
        }

        // Use array form to ensure session is honored across Mongoose versions
        const [created] = await KYC.create([docData], { session })
        docId = created._id

        //mark previous pending KYC for this user as superseded:
        await KYC.updateMany(
          { user: userId, _id: { $ne: docId }, status: { $in: ["pending"] } },
          { $set: { status: "canceled", "outcome.status": "canceled" } },
          { session }
        )
      },
      {
        // Optional tuning:
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    )
  } finally {
    await session.endSession()
  }

  // ---------- 4) Respond to SPA ----------
  return res.json({
    sessionId: docId,
    diditSessionId,
    hostedUrl,
    status: decisionStatus,
    checks: checksPreview,
  })
})
//#endregion

//#region @desc DidIt webhook receiver (status/data updates)
// @route POST /api/webhook/didit
// @access Public (signed by Didit; verify HMAC)
const kycWebhook = async (req, res) => {
  try {
    const secret = process.env.DID_IT_WEBHOOK_SECRET
    const sig = req.get(SIGNATURE_HEADER)
    const ts = req.get(TIMESTAMP_HEADER)
    const raw = req.body

    if (!secret || !sig || !ts || !raw) return res.status(401).send("unauthorized")

    const now = Math.floor(Date.now() / 1000)
    const incoming = parseInt(ts, 10)
    if (!Number.isFinite(incoming) || Math.abs(now - incoming) > MAX_SKEW_SECONDS) {
      return res.status(401).send("stale")
    }

    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex")
    const a = Buffer.from(expected, "utf8")
    const b = Buffer.from(sig, "utf8")
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).send("bad-signature")
    }

    const evt = JSON.parse(raw.toString("utf8"))
    const { session_id, status, webhook_type, reference_id } = evt ?? {}
    if (!session_id || !webhook_type) return res.status(200).send("ok")

    const doc = await KYC.findOne({ "audit.diditSessionId": session_id }).lean()
    if (!doc) return res.status(200).send("ok")

    const eventKey = buildEventKey(evt)
    if (doc.audit?.lastEventId && doc.audit.lastEventId === eventKey) {
      return res.status(200).send("ok")
    }

    const mapped = mapDiditStatus(status)
    const occurredMs = (() => {
      const t = evt.created_at ?? evt.timestamp ?? Date.now()
      return String(t).length > 11 ? Number(t) : Number(t) * 1000
    })()

    // KYC progress update
    await KYC.updateOne(
      { "audit.diditSessionId": session_id },
      {
        $set: {
          status: mapped,
          "outcome.status": mapped,
          "audit.lastEventId": eventKey,
          "audit.lastEventType": webhook_type,
          "audit.lastEventAt": new Date(),
        },
        $push: {
          "audit.events": {
            $each: [{ id: eventKey, type: webhook_type, occurredAt: new Date(occurredMs), status: mapped }],
            $slice: -20,
          },
        },
      }
    )

    // Optional terminal fetch + snapshot
    if (isTerminal(status)) {
      try {
        const decision = await fetchDecisionOnce(session_id, {
          base: process.env.DID_IT_BASE,
          apiKey: process.env.DID_IT_KEY,
          timeoutMs: 2000,
        })
        const summary = extractSummary(decision)
        await KYC.updateOne(
          { "audit.diditSessionId": session_id },
          {
            $set: {
              status: mapped,
              outcome: { status: mapped, verifiedAt: new Date(), summary },
              "audit.decisionSnapshot": {
                status: decision?.status,
                workflow_id: decision?.workflow_id,
                features: decision?.features || [],
              },
            },
          }
        )
      } catch (e) {
        console.error("[DIDIT] decision fetch failed after terminal webhook:", e?.message)
      }
    }

    // 🔶 Update the user flag (only if THIS is the latest KYC for the user)
    try {
      const latest = await KYC.findOne({ user: doc.user }).sort({ createdAt: -1 }).select("_id").lean()
      if (latest && String(latest._id) === String(doc._id)) {
        await User.updateOne({ _id: doc.user }, { $set: { kycVerification: mapStatusToUserFlag(mapped) } })
      }
    } catch (e) {
      console.error("user flag update error:", e?.message)
    }

    // Emit to sockets
    try {
      const payload = { session_id, status: mapped, webhook_type }
      privateNamespace.to(doc?.user).emit("kyc_status", payload)
    } catch (e) {
      console.error("socket emit error:", e?.message)
    }

    return res.status(200).send("ok")
  } catch (err) {
    console.error("kycWebhook error:", err)
    return res.status(200).send("ok")
  }
}

//#endregion

//#region @desc Return session status; refresh from Didit if still pending/user_in_progress/needs_review
// @route GET /api/kyc/session/:id
// @access Private
const getKycStatus = asyncHandler(async (req, res) => {
  const id = req.params.id
  const doc = await KYC.findById(id)
  if (!doc || String(doc.user) !== String(req.user._id)) {
    return res.status(404).json({ error: "not_found" })
  }

  // Refresh from Didit if still in-flight
  if (PENDING_STATES.has(doc.status) && doc.audit?.diditSessionId) {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 12000)
    const resp = await fetch(`${DIDIT_BASE}/session/${doc.audit.diditSessionId}/`, {
      method: "GET",
      headers: { Authorization: `Bearer ${DIDIT_KEY}` },
      signal: controller.signal,
    }).catch((e) => {
      // Don’t throw; just return current state if Didit unreachable
      return null
    })
    clearTimeout(t)

    if (resp && resp.ok) {
      const data = await resp.json()
      const newStatus = normalizeStatus(data.status)
      if (newStatus && newStatus !== doc.status) {
        doc.outcome = { ...(doc.outcome || {}), status: newStatus }
        doc.status = newStatus
        await doc.save()
      }
    }
  }

  res.json({
    status: doc.status,
    hostedUrl: doc.audit?.hostedUrl || null,
    embedToken: doc.audit?.embedToken || null,
    outcome: doc.outcome?.summary || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  })
})
//#endregion

//#region @desc Return latest (or all) KYC records for current user
// @route GET /api/kyc?latest=true
// @access Private
const getMyKyc = asyncHandler(async (req, res) => {
  const { latest = "true" } = req.query

  if (latest === "true") {
    const doc = await KYC.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select("_id status outcome retriesUsed retriesAllowed audit.diditSessionId createdAt updatedAt")
      .lean()

    if (!doc) return res.json(null)

    return res.json({
      sessionId: doc._id,
      diditSessionId: doc.audit?.diditSessionId || null,
      status: doc.status,
      outcome: doc.outcome || {},
      checks: {},
      retriesUsed: doc.retriesUsed ?? 0,
      retriesAllowed: doc.retriesAllowed ?? 2,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })
  }

  // full list
  const items = await KYC.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .select("_id status outcome retriesUsed retriesAllowed audit.diditSessionId createdAt updatedAt")
    .lean()

  return res.json({
    items: items.map((d) => ({
      sessionId: d._id,
      diditSessionId: d.audit?.diditSessionId || null,
      status: d.status,
      outcome: d.outcome || {},
      checks: {},
      retriesUsed: d.retriesUsed ?? 0,
      retriesAllowed: d.retriesAllowed ?? 2,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  })
})
//#endregion

//#region @desc Return  Admin listing with filters & pagination
// @route GET /api/kyc/admin
// @access Private
const getAllKyc = asyncHandler(async (req, res) => {
  const { status, userId, page = 1, limit = 20 } = req.query
  const q = {}
  if (status) q.status = status
  if (userId) q.user = userId

  const pageNum = Math.max(1, parseInt(page, 10) || 1)
  const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 20))
  const skip = (pageNum - 1) * lim

  const [items, total] = await Promise.all([KYC.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim), KYC.countDocuments(q)])

  res.json({
    total,
    page: pageNum,
    limit: lim,
    items: items.map((d) => ({
      _id: d._id,
      user: d.user,
      status: d.status,
      services: d.services,
      outcome: d.outcome?.summary || null,
      audit: { diditSessionId: d.audit?.diditSessionId, lastEventType: d.audit?.lastEventType, lastEventAt: d.audit?.lastEventAt },
      manualReview: d.manualReview || null,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    })),
  })
})
//#endregion

//#region @desc Admin manual review override
// @route PUT /api/kyc/admin
// @access Private
const reviewKyc = asyncHandler(async (req, res) => {
  const { id, decision, notes } = req.body
  const doc = await KYC.findById(id)
  if (!doc) return res.status(404).json({ error: "not_found" })

  const mapped = decision === "approved" ? "verified" : decision === "rejected" ? "failed" : decision === "needs_review" ? "needs_review" : doc.status

  doc.outcome = { ...(doc.outcome || {}), status: mapped }
  doc.status = mapped
  doc.manualReview = {
    required: decision !== "approved",
    reviewer: req.user?._id,
    notes: notes || "",
    reviewedAt: new Date(),
  }

  await doc.save()
  res.json({ ok: true, status: doc.status })
})
//#endregion

export { startKycSession, kycWebhook, getKycStatus, getMyKyc, getAllKyc, reviewKyc }
