import { Types } from "mongoose"
import sharp from "sharp"
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { sendEmail } from "../middleware/s3.js"
import { privateNamespace } from "./socket.js"
import RedisTemp from "../models/redis_temp.js"

/* ----------------------------------------------------------
 *  CONSTANTS
 * ---------------------------------------------------------- */

export const ERROR_RESPONSE = {
  USER_NOT_FOUND: "User not found.",
  ORG_NOT_FOUND: "Organization not found.",
  INVALID_REQUEST: "Invalid request data.",
  INVALID_STATE: "Database invalid state.",
  FAILED_AUTH: "Invalid credentials.",
  FAILED: "Database operation failed.",
  DUPLICATE_ENTRY: "Duplicate entry detected.",
  INSUFFICIENT_FUNDS: "Insufficient funds.",
  ACCESS_DENIED: "You are not authorized for this action.",
}

export const SUCCESS_RESPONSE = {
  SUCCESS: "Operation successful.",
  CREATED: "Record created successfully.",
}

/* ----------------------------------------------------------
 *  HELPER FUNCTIONS
 * ---------------------------------------------------------- */

/** Format large numbers (e.g., 1.2k, 2.3m) */
export const formatCount = (count) => {
  if (count < 1000) return count.toString()
  if (count < 1_000_000) return (count / 1000).toFixed(count % 1000 === 0 ? 0 : 1) + "k"
  return (count / 1_000_000).toFixed(count % 1_000_000 === 0 ? 0 : 1) + "m"
}

/** Generate consistent room IDs for messaging */
export const generateRoomId = (id1, id2) => [id1, id2].sort().join("")

/** Generate MongoDB ObjectId manually (if needed for pre-signed docs) */
export const generateMongoDBObjectId = () => new Types.ObjectId()

/** Extract client IP from proxy or direct */
export const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0] ||
  req.connection?.remoteAddress ||
  req.socket?.remoteAddress ||
  req.ip

/* ----------------------------------------------------------
 *  IMAGE PROCESSING
 * ---------------------------------------------------------- */

/** Compress and resize uploaded image before saving to Wasabi */
export const compressImage = async (
  buffer,
  options = { width: 1080, quality: 80, format: "jpeg" }
) => {
  const { width, quality, format } = options
  let transformer = sharp(buffer).resize({ width, withoutEnlargement: true })

  switch (format) {
    case "webp":
      transformer = transformer.webp({ quality })
      break
    case "png":
      transformer = transformer.png({ quality })
      break
    default:
      transformer = transformer.jpeg({ quality })
      break
  }

  return transformer.toBuffer()
}

export const setTempData = async (key, value, ttlSeconds = 300) => {
  try {
    await RedisTemp.create({
      key,
      value,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    })
  } catch (error) {
    console.error("RedisTemp Temp Store Error:", error)
    throw new Error("Failed to store temporary data")
  }
}

export const getTempData = async (key) => {
  try {
    const entry = await RedisTemp.findOneAndDelete({ key })
    return entry?.value || null
  } catch (error) {
    console.error("RedisTemp Temp Fetch Error:", error)
    throw new Error("Failed to retrieve temporary data")
  }
}


/* ----------------------------------------------------------
 *  MIME TYPES
 * ---------------------------------------------------------- */

export const mimeFromExt = (ext) => {
  const lookup = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  }
  return lookup[ext.toLowerCase()] || "application/octet-stream"
}

/* ----------------------------------------------------------
 *  USER / ORG NOTIFICATIONS
 * ---------------------------------------------------------- */

/**
 * Send email + internal notification via unified Notification model
 */
export const sendSystemNotification = async ({
  recipients,
  subject,
  message,
  type = "system_alert",
  from = { userName: "System", model: "System" },
  actions = [],
  orgContext = {},
}) => {
  try {
    // Save internal notification(s)
    const payloads = (Array.isArray(recipients) ? recipients : [recipients]).map((id) => ({
      recipient: { _id: id, model: orgContext.model || "OrgUser" },
      sender: from,
      subject,
      message,
      type,
      actions,
      orgContext,
    }))

    await Notification.insertMany(payloads)

    // Send socket event
    for (const id of Array.isArray(recipients) ? recipients : [recipients]) {
      privateNamespace.to(`${orgContext.model || "org"}:${id}`).emit("notification", {
        subject,
        message,
        type,
        from,
        actions,
        timestamp: new Date(),
      })
    }

    // Optional: Send email
    if (orgContext.email) {
      const htmlBody = `
        <div style="font-family:Arial;padding:20px;">
          <h2>${subject}</h2>
          <p>${message}</p>
          <p style="font-size:12px;color:#777;">© ${new Date().getFullYear()} ${process.env.PROJECT_NAME}</p>
        </div>`
      await sendEmail({ to: orgContext.email, subject, htmlBody, textBody: message })
    }
  } catch (error) {
    console.error("sendSystemNotification Error:", error)
    throw new Error("Notification dispatch failed")
  }
}

/* ----------------------------------------------------------
 *  STATUS MAPPERS
 * ---------------------------------------------------------- */

export const mapVerificationStatus = (status) => {
  const s = String(status || "").toLowerCase()
  if (["approved", "verified", "success"].includes(s)) return "verified"
  if (["declined", "rejected", "failed"].includes(s)) return "failed"
  if (["in progress", "review"].includes(s)) return "in_review"
  if (["pending", "created"].includes(s)) return "pending"
  if (["cancelled", "abandoned"].includes(s)) return "canceled"
  if (["expired", "timeout"].includes(s)) return "expired"
  return "pending"
}