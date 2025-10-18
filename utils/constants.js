import { Types } from "mongoose"
import sharp from "sharp"
import Redis from "../models/redisModel.js"
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import UserNotifications from "../models/userNotificationsModel.js"
import { sendEmail } from "../middleware/s3.js"

export const ERROR_RESPONSE = {
  //#region User
  EMAIL_ALREADY_REGISTERED: "Choose an alternative!.. Email already registered.",
  FAILED_VERIFICATION: "Verification Failed!O NO!.",
  USER_NOT_FOUND: "Unable to locate defined user!",
  USER_ALREADY_EXIST: "User already Exist!..",
  EMAIL_IN_USE: " Email already in use, login or request a password reset..",
  MUST_BE_SIXTEEN_AND_OLDER: "User must be 16 and older..",
  USER_NOT_CREATED: "Error creating user!",
  UNAUTHORIZED: "😡😡The FBI's on their way mo-fucka?!!!😒😒😒",
  //#endregion

  //#region OrderType
  ORDER_TYPE_NOT_FOUND: "Unable to locate defined heist!",
  ORDER_TYPE_ALREADY_EXIST: "OrderType already Exist!..",
  //#endregion

  //#region Image
  IMAGE_NOT_FOUND: "Unable to locate defined image!",
  IMAGE_ALREADY_EXIST: "Image already Exist!..",
  //#endregion

  //#region General
  FAILED_AUTH: "Invalid credentials!!!",
  FAILED: "Database operation failed",
  INVALID_DATA: "Invalid data provided!",
  FAILED_VERIFICATION: "Verification Failed!",
  ALREADY_APPROVED: "No need, already Approved!",
  ALREADY_PROCESSING: "No need, already Processing!",
  INSUFFICIENT_FUNDS: "Insufficient funds! please deposit funds.",
  DUPLICATE_ENTRY: "Object already exist in database",
  INVALID_REQUEST: "Request deemed invalid, please check console for errors.",
  INVALID_STATE: "database info invalid state"
  //#endregion
}

export const SUCCESS_RESPONSE = {
  //#region User
  USER_CREATED: "User has been created..!",
  //#endregion

  //#region General
  SUCCESS: "success",
  CREATED: "successfully created object in database",
  //#endregion
}

export const formatCount = (count) => {
  if (count < 1000) {
    return count.toString()
  } else if (count >= 1000 && count < 1000000) {
    return (count / 1000).toFixed(count % 1000 === 0 ? 0 : 1) + "k"
  } else if (count >= 1000000) {
    return (count / 1000000).toFixed(count % 1000000 === 0 ? 0 : 1) + "m"
  }
}

export const generateRoomId = (userId1, userId2) => {
  // Sort the IDs to ensure consistency
  const sortedIds = [userId1, userId2].sort()
  return sortedIds.join("")
}

export const generateMongoDBObjectId = () => {
  // Generate a 4-byte timestamp (seconds since the Unix epoch)
  const timestamp = Math.floor(Date.now() / 1000)
    .toString(16)
    .padStart(8, "0")

  // Generate 5 bytes of random values (machine identifier / random value)
  const randomBytes = Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("")

  // Generate 3 bytes of a counter (unique value per ObjectId)
  const counter = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")

  // Combine all parts to form a 24-character hex string
  return new Types.ObjectId(`${timestamp}${randomBytes}${counter}`)
}


/**
 * Compresses and resizes an image buffer to be optimized for upload.
 * @param {Buffer} buffer - The original image buffer.
 * @param {Object} options - Optional resizing and compression settings.
 * @returns {Promise<Buffer>} - A compressed image buffer.
 */
export const compressImage = async (
  buffer,
  options = {
    width: 1080, // max width
    quality: 80, // JPEG/WebP quality
    format: "jpeg", // jpeg | png | webp
  }
) => {
  const { width, quality, format } = options

  let transformer = sharp(buffer).resize({
    width,
    withoutEnlargement: true,
  })

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

  return await transformer.toBuffer()
}

// Set temporary user data
export const setTempUserData = async (token, data, ttl = 60) => {
  try {
    const expirationTime = Date.now() + ttl * 1000 // TTL in milliseconds
    await Redis.create({
      key: `signup:${token}`,
      value: data,
      createdAt: new Date(expirationTime), // Set the expiration time
    })
  } catch (error) {
    console.error("Error setting temporary user data:", error)
    throw new Error("Failed to store temporary user data")
  }
}

// Get temporary user data
export const getTempUserData = async (token) => {
  try {
    const entry = await Redis.findOneAndDelete({ key: `signup:${token}` })
    if (entry) {
      return entry.value
    }
    return null // No data found or expired
  } catch (error) {
    console.error("Error fetching temporary user data:", error)
    throw new Error("Failed to retrieve temporary user data")
  }
}

export const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0] || // Behind proxies (e.g., Vercel, Heroku)
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip
  )
}

/**
 * Generate a signed URL for uploading or downloading from Wasabi
 * @param {string} fileName - Name or path of the file
 * @param {string} bucketName - Target Wasabi bucket
 * @param {"upload" | "download"} action - Action type: 'upload' or 'download'
 * @param {string} [contentType] - MIME type for uploads (optional)
 */
export const generateSignedUrl = async (fileName, bucketName, action = "download", contentType = "application/octet-stream") => {
  const wasabiS3 = new S3Client({
    region: process.env.WASABI_REGION,
    endpoint: process.env.WASABI_ENDPOINT,
    credentials: {
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
    },
    forcePathStyle: true,
  })

  // Step 1: Sanitize only if it's a full Wasabi public URL
  let key = fileName

  // if (/^https?:\/\//.test(fileName) && action === "download") {
  //   const url = new URL(fileName)
  //   key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname
  // } else {
  //   // Handle both with and without userId in the URL
  //   key = fileName.replace(/^https?:\/\/[^\/]+\/(?:[^\/]+\/)?(.+)$/, "$1")
  // }
  if (fileName.startsWith("http") && action === "download") {
    const url = new URL(fileName)
    key = decodeURIComponent(url.pathname.slice(1)) // 🧠 decode to avoid double encoding
  } else {
    key = fileName
  }

  // Step 2: Prepare correct command
  let command
  if (action === "upload") {
    command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
      ACL: "public-read", // Optional
    })
  } else {
    command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    })
  }

  // Step 3: Generate signed URL
  const signedUrl = await getSignedUrl(wasabiS3, command, {
    expiresIn: 60 * 10, // 10 minutes
  })
  return signedUrl
}

/**
 * Deletes one or more media files from Wasabi
 * @param {string[]} mediaUrls - Array of full Wasabi URLs to delete
 * @returns {Promise<void>}
 */
export const deleteMediasFromWasabi = async (mediaUrls = []) => {
  const wasabiS3 = new S3Client({
    region: process.env.WASABI_REGION,
    endpoint: process.env.WASABI_ENDPOINT,
    credentials: {
      accessKeyId: process.env.WASABI_ACCESS_KEY,
      secretAccessKey: process.env.WASABI_SECRET_KEY,
    },
    forcePathStyle: true,
  })

  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return

  const bucket = process.env.WASABI_CHAT_MEDIA_BUCKET

  // Extract keys from full Wasabi URLs
  const keys = mediaUrls
    .map((url) => {
      const parts = url.split(".com/")
      return parts[1] || "" // The part after '.com/' is the S3 key
    })
    .filter(Boolean)

  if (keys.length === 0) return

  const deleteParams = {
    Bucket: bucket,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
      Quiet: false,
    },
  }

  try {
    await wasabiS3.send(new DeleteObjectsCommand(deleteParams))
    console.log(`Deleted ${keys.length} media file(s) from Wasabi.`)
  } catch (error) {
    console.error("Failed to delete media from Wasabi:", error)
    throw new Error("Failed to delete media from Wasabi")
  }
}

export const extractWasabiKey = (url) => {
  try {
    const base = "https://project.s3.wasabisys.com/"
    return url.startsWith(base) ? url.replace(base, "") : null
  } catch (e) {
    return null
  }
}

/**
 * Notify a user via email and in-app notification
 * @param {Object} options
 * @param {String} options.userId - MongoDB user ID
 * @param {String} options.subject - Email subject
 * @param {String} options.message - Notification message
 * @param {String} options.htmlBody - Optional rich HTML email body
 * @param {String} options.textBody - Optional plain text email body
 * @param {String} options.type - Notification type: "success", "error", "info", etc.
 * @param {Object} options.session - Optional Mongo session for transaction support
 */
export const sendUserEmail = async ({ user, subject, message, htmlBody, textBody, type = "info", session = null }) => {
  const defaultText = textBody || message
  const defaultHTML =
    htmlBody ||
    `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
      <p>Hello ${user.username},</p>
      <p>${message}</p>
      <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} LepGold</p>
    </div>
  `

  // Send Email
  await sendEmail({
    to: user.email,
    subject,
    htmlBody: defaultHTML,
    textBody: defaultText,
  })

  // Push In-App Notification
  await UserNotifications.findOneAndUpdate(
    { _id: user._id },
    {
      $push: {
        notifications: {
          message,
          type,
          createdAt: new Date(),
        },
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    }
  )
}

export const mimeFromExt = (ext) => {
  switch (ext) {
    case ".jpg":
    case ".jpeg":
    case ".png":
    case ".gif":
      return "image/" + ext.replace(".", "")
    case ".mp4":
    case ".mov":
    case ".wmv":
      return "video/" + ext.replace(".", "")
    case ".mp3":
    case ".wav":
      return "audio/" + ext.replace(".", "")
    default:
      return "application/octet-stream"
  }
}

export const mapDiditStatus = (s) => {
  const v = String(s || "").toLowerCase()
  if (["not started", "unknown", "pending", "created"].includes(v)) return "pending"
  if (["in progress", "started", "user_in_progress"].includes(v)) return "user_in_progress"
  if (["in review", "review", "needs_review"].includes(v)) return "needs_review"
  if (["approved", "verified", "completed", "success"].includes(v)) return "verified"
  if (["declined", "rejected", "failed", "error"].includes(v)) return "failed"
  if (["canceled", "cancelled", "abandoned"].includes(v)) return "canceled"
  if (["expired", "timeout"].includes(v)) return "expired"
  return "pending"
}


export const TERMINAL_KYC_STATUSES = new Set(["verified", "failed", "expired", "abandoned"])
