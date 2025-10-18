import asyncHandler from "express-async-handler"
import generateToken from "../utils/generateToken.js"
import User from "../models/userModel.js"
import { ERROR_RESPONSE, generateSignedUrl } from "../utils/constants.js"
import { differenceInCalendarYears, parse } from "date-fns"
import generateUserAuthData from "../utils/generateUserAuthData.js"
import { onlineUsers, privateNamespace } from "../utils/socket.js"
import mongoose from "mongoose"
import UserNotifications from "../models/userNotificationsModel.js"
import Redis from "../models/redisModel.js"
import { sendEmail } from "../middleware/s3.js"
import KYC from "../models/kycModel.js"
import { format } from "util"
import { Storage } from "@google-cloud/storage"
import path from "path"
import { sendNotification } from "../utils/notificationService.js"
import Counter from "../models/counterModel.js"

//#region @desc Register new user
// @route POST /user
// @access Public
const registerUser = asyncHandler(async (req, res) => {
  console.log("i am registering once")
  const { userName, googleId, location, firstName, lastName, gender, dob, email, country, termsCondition, newsLetters, password } = req.body

  if (!googleId && !password) {
    throw new Error("Either Google ID or password is required")
  }
  console.log(req.body)
  // Ensure coordinates are valid
  if (!location || isNaN(Number(location.lng)) || isNaN(Number(location.lat))) {
    throw new Error("Invalid location coordinates")
  }

  const dateOfBirth = parse(dob, "MM/dd/yyyy", new Date())
  const age = differenceInCalendarYears(new Date(), dateOfBirth)

  if (age < 16) {
    throw new Error(ERROR_RESPONSE.MUST_BE_SIXTEEN_AND_OLDER)
  }
  const session = await mongoose.startSession()

  try {
    const result = await session.withTransaction(async () => {
      const existingUser = await User.findOne({
        $or: [{ userName }, { email }],
      })
        .collation({ locale: "en_US", strength: 2 })
        .session(session)

      if (existingUser) {
        throw new Error(ERROR_RESPONSE.USER_ALREADY_EXIST)
      }
      console.log("exixt user?", existingUser)
      const newUserData = {
        userName: userName.toLowerCase(),
        firstName: firstName.toLowerCase(),
        lastName: lastName.toLowerCase(),
        gender,
        dob: new Date(dob),
        email: email.toLowerCase(),
        country,
        location: {
          type: "Point",
          coordinates: [Number(location.lng), Number(location.lat)],
        },
        termsCondition,
        newsLetters,
        password,
        avatar: process.env.LEPRECHAUN_IMAGE,
        createdBy: email.toLowerCase(),
      }

      if (typeof googleId === "string" && googleId.trim()) {
        newUserData.googleId = googleId.trim()
      }

      const [createdUser] = await User.create([newUserData], { session })

      await Counter.findOneAndUpdate({ key: "userCount" }, { $inc: { count: 1 } }, { upsert: true, new: true, session })

     
      return { createdUser }
    })

    const { createdUser } = result
    await sendNotification({
      userId: createdUser._id,
      type: "welcome",
      subject: "Welcome to PROJECT",
      message: "We welcome you, our new member! Please head to the About page and learn how to get started.",
      from: {
        _id: process.env.SYSTEM_ADMIN,
        userName: "PROJECT",
        avatar: process.env.ADMIN_IMAGE,
      },
      actions: [
        {
          type: "ONBOARDING",
          text: "Go to About",
          url: "about",
        },
      ],
    })

    res.status(201).json({
      user: {
        _id: createdUser._id,
        userName: createdUser.userName,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        gender: createdUser.gender,
        dob: createdUser.dob,
        email: createdUser.email,
        country: createdUser.country,
        termsCondition: createdUser.termsCondition,
        newsLetters: createdUser.newsLetters,
        emailVerified: createdUser.emailVerified,
        isAdmin: createdUser.isAdmin,
        riddleWin: createdUser.riddleWin,
        avatar: createdUser.avatar,
        customerId: createdUser.customerId,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt,
        kycVerification: createdUser.kycVerification,
        token: generateToken(createdUser._id),
      },
    })
  } catch (error) {
    console.log(error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: error.message || "An unexpected error occurred.",
    })
  }
})
//#endregion

//#region @desc Auth user & get token
// @route POST /user/login
// @access Public
const authUser = asyncHandler(async (req, res) => {
  const { userName, password } = req.body

  try {
    const user = await User.findOne({
      $or: [{ userName }, { email: userName }],
    })
      .collation({
        locale: "en_US",
        strength: 2,
      })
      .populate([ { path: "country", select: "-createdBy -updatedAt" }])

    if (!user) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Authentication failed",
      })
    }

    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Authentication failed",
      })
    }

    // Handle duplicate sessions
    if (onlineUsers.has(user._id.toString())) {
      console.log("Online users logout triggered")

      privateNamespace.to(user._id.toString()).emit("logoutUser")

      // Add a timeout fallback in case the user doesn't disconnect gracefully
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

  } catch (error) {
    console.error("Auth error:", error)

    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: "An internal error occurred",
    })
  }
})
//#endregion

//#region @desc Auth user & get user Data
// @route GET /auth/auth-data
// @access Private
const getAuthData = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate([ { path: "country", select: "-createdBy -updatedAt" }])
      .lean()
    if (!user) {
      return res.status(404).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "User not found",
      })
    }
    // user.avatar = await generateSignedUrl(user.avatar, process.env.WASABI_PROFILE_IMAGE_BUCKET)
    res.status(200).json(generateUserAuthData(user))
  } catch (error) {
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `${error}`,
    })
  }
})
//#endregion

//#region @desc Get User Profile
// @route Get /user/profile
// @access Private
const getUserProfile = asyncHandler(async (req, res) => {
  try {
    const id = req.body.id ? req.body.id : req.user._id
    const user = await User.findById(id).select("-password -customerId")
    if (user) {
      res.json(user)
    } else {
      res.status(404)
      throw new Error(ERROR_RESPONSE.USER_NOT_FOUND)
    }
  } catch (error) {
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `${error}`,
    })
  }
})
//#endregion

//#region @desc Update User Profile
// @route PUT /user/profile
// @access Private
const updateUserProfile = asyncHandler(async (req, res) => {
  const { firstName, lastName, gender, dob, email, country, newsLetters, password } = req.body

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const id = req.body.id ? req.body.id : req.user._id
    const user = await User.findById(id).session(session).select("-password -customerId")

    if (!user) {
      await session.abortTransaction()
      session.endSession()
      res.status(404)
      throw new Error(ERROR_RESPONSE.USER_NOT_FOUND)
    }

    const isEmailChanged = email && user.email !== email

    user.firstName = firstName || user.firstName
    user.lastName = lastName || user.lastName
    user.gender = gender || user.gender
    user.dob = dob || user.dob
    user.email = email || user.email
    user.country = country || user.country
    user.newsLetters = newsLetters || user.newsLetters

    if (password) {
      user.password = password
    }

    if (isEmailChanged) user.emailVerified = false

    const updateUser = await user.save({ session })
    await updateUser.populate([
      { path: "country", select: "-createdBy -updatedAt" },
    ])
    await session.commitTransaction()
    res.json(updateUser)

    session.endSession()
  } catch (error) {
    await session.abortTransaction()
    session.endSession()

    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `${error}`,
    })
  }
})
//#endregion

//#region @desc Update User Profile image
// @route POST /user/profile_image
// @access Private
const updateProfileImage = asyncHandler(async (req, res) => {
  const bucket_key = {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_BUCKET_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
  }
  const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: bucket_key,
  })
  const bucket = storage.bucket(process.env.GOOGLE_CLOUD_BUCKET)
  try {
    if (!req.file) {
      res.status(400)
      res.json({
        error: ERROR_RESPONSE.FAILED,
        message: "Please upload a file!",
      })
    }

    const fileTypes = /jpg|jpeg|png/
    const extName = fileTypes.test(path.extname(req.file.originalname).toLowerCase())
    const mimetype = fileTypes.test(req.file.mimetype)

    if (!extName | !mimetype) {
      res.status(400)
      res.json({
        error: ERROR_RESPONSE.FAILED,
        message: "Please upload images only!",
      })
    }
    const [files] = await bucket.getFiles({ prefix: `${req.user._id}` })
    await Promise.all(files.map((file) => file.delete()))

    // Create a new blob in the bucket and upload the file data.
    const blob = bucket.file(`${req.user._id}${path.extname(req.file.originalname).toLowerCase()}`)
    const blobStream = blob.createWriteStream({
      resumable: false,
      metadata: {
        cacheControl: "public, max-age=0",
      },
    })

    blobStream.on("error", (err) => {
      res.status(500)
      res.json({
        error: ERROR_RESPONSE.FAILED,
        message: err.message,
      })
    })

    blobStream.on("finish", async (data) => {
      const publicUrl = format(`${blob.storage.apiEndpoint}/${process.env.GOOGLE_CLOUD_BUCKET}/${blob.name}`)
      const user = await User.findOneAndUpdate({ _id: req.user._id }, { $set: { avatar: publicUrl } }, { new: true })

      res.json(generateUserAuthData(user))
    })

    blobStream.end(req.file.buffer)
  } catch (err) {
    res.status(500)
    res.json({
      error: ERROR_RESPONSE.FAILED,
      message: `Could not upload the file: ${req.file.originalname}. ${err}`,
    })
  }
})
//#endregion

//#region @desc Get user temp data
// @route Get /user/get-temp-user-data
// @access Private
const getUserTempData = asyncHandler(async (req, res) => {
  const { token } = req.query
  try {
    const tempUserData = req.data

    if (tempUserData) {
      await Redis.deleteOne({ key: `sign_in:${token}` })

      return res.json({
        success: true,
        userData: tempUserData,
      })
    }

    return res.json({ success: false, message: "Temp user data not found" })
  } catch (error) {
    console.error("Error fetching temp user data:", error)
    return res.status(500).json({
      success: false,
      message: "Error fetching user data",
    })
  }
})
//#endregion

//#region @desc Send OTP for Email Verification
// @route POST /user/send-verification-otp
// @access Private
const sendVerificationOtp = asyncHandler(async (req, res) => {
  const { type, email } = req.body // type: "email", and target email

  if (!["email"].includes(type) || !email) {
    return res.status(400).json({ success: false, message: "Invalid verification type or missing email" })
  }

  const user = req.user
  const normalizedEmail = email.trim().toLowerCase()
  const query =  { email: normalizedEmail, emailVerified: true }

  const existingUser = await User.findOne(query)

  if (existingUser && String(existingUser._id) !== String(user._id)) {
    return res.status(400).json({
      success: false,
      message: `This ${type} is already in use by another verified account.`,
    })
  }

  const otp = Math.floor(100000 + Math.random() * 900000)
  const redisKey = `verify_${type}:${normalizedEmail}`

  await Redis.findOneAndUpdate({ key: redisKey }, { value: otp, createdAt: new Date() }, { upsert: true, new: true, setDefaultsOnInsert: true })

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #333;">Verification Code</h2>
      <p>Hello,</p>
      <p>Your OTP code for verifying your email address is:</p>
      <h1 style="color: #007BFF; font-size: 32px; letter-spacing: 2px;">${otp}</h1>
      <p>This code is valid for 5 minutes. If you didn’t request this, you can ignore this email.</p>
      <br />
      <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} PROJECT</p>
    </div>
  `

  await sendEmail({
    to: normalizedEmail,
    subject: "Your Verification Code",
    htmlBody,
    textBody: `Your verification code is ${otp}. It will expire in 5 minutes.`,
  })

  return res.json({
    success: true,
    message: `OTP sent to user email successfully`,
  })
})
//#endregion

//#region @desc Verify OTP for Email Verification
// @route POST /user/verify-otp
// @access Private
const verifyOtp = asyncHandler(async (req, res) => {
  const { type, otp, email } = req.body // type: "email", and email to verify

  if (!["email"].includes(type) || !otp || !email) {
    return res.status(400).json({ success: false, message: "Invalid request" })
  }

  // Normalize for matching
  const normalizedEmail = email.trim().toLowerCase()
  const user = req.user

  const query = { email: normalizedEmail, emailVerified: true }

  const existingUser = await User.findOne(query)

  if (existingUser && String(existingUser._id) !== String(user._id)) {
    return res.status(400).json({
      success: false,
      message: `This ${type} is already in use by another verified account.`,
    })
  }

  const redisKey = `verify_${type}:${normalizedEmail}`
  const redisEntry = await Redis.findOne({ key: redisKey })

  if (!redisEntry || String(redisEntry.value) !== String(otp)) {
    return res.status(400).json({ success: false, message: "Invalid or expired OTP" })
  }

  if (type === "email") {
    user.email = normalizedEmail
    user.emailVerified = true
  }
  await user.save()
  await Redis.deleteOne({ key: redisKey })

  return res.json({
    success: true,
    user,
    message: `Email  verified successfully`,
  })
})
//#endregion

//#region @desc Get paginated user notifications
// @route GET /notifications
// @access Private
const getUserNotifications = asyncHandler(async (req, res) => {
  const userId = req.user._id
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 20
  const skip = (page - 1) * limit

  try {
    const [notifications, total] = await Promise.all([
      UserNotifications.find({ userId })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit),
      UserNotifications.countDocuments({ userId }),
    ])

    res.json({
      notifications,
      pageInfo: {
        page,
        total,
        limit,
      },
    })
  } catch (error) {
    console.error(`⚠️ Error fetching notifications: ${error.message}`)
    res.status(500).json({
      error: "Server Error",
      message: "Failed to load notifications.",
    })
  }
})
//#endregion

//#region @desc Update User has viewed notifications
// @route PUT /notification/viewed
// @access Private
const updateNotificationViewState = asyncHandler(async (req, res) => {
  console.log(req.body)
  const { notification_ids } = req.body

  if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
    return res.status(400).json({ message: "No notification IDs provided." })
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const userId = req.user._id

    const result = await UserNotifications.updateMany(
      {
        _id: { $in: notification_ids },
        userId: userId,
      },
      {
        $set: { status: "viewed" },
      },
      { session }
    )

    if (result.modifiedCount === 0) {
      await session.abortTransaction()
      return res.status(404).json({ message: "No notifications updated." })
    }

    await session.commitTransaction()
    res.json({
      message: "Notifications marked as viewed.",
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("❌ Notification view state update failed:", error)
    res.status(500).json({
      message: "Failed to update notification view state.",
      error: error.message,
    })
  } finally {
    session.endSession()
  }
})
//#endregion

//#region @desc Update User notification action state
// @route PUT /notification/action_taken
// @access Private
const updateActionTaken = asyncHandler(async (req, res, next) => {
  const { notification_id, action_taken } = req.body
  const userId = req.user._id

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const notification = await UserNotifications.findOneAndUpdate(
      { _id: notification_id, userId },
      {
        $set: {
          action_required: false,
          action_taken: action_taken,
        },
      },
      {
        new: true, // Return the updated document
        session,
      }
    )

    if (!notification) {
      await session.abortTransaction()
      return res.status(404).json({
        error: true,
        message: ERROR_RESPONSE.NOTIFICATION_NOT_FOUND || "Notification not found",
      })
    }

    await session.commitTransaction()
    res.json({
      message: "Action updated successfully",
      notification,
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("❌ Notification update failed:", error)

    return res.status(500).json({
      error: true,
      message: "Failed to update notification action.",
    })
  } finally {
    session.endSession()
  }
})
//#endregion

//#region @desc Generate Signed URL for Upload or Download
// @route GET /user/media/signed-url?filename=somefile.jpg&type=media&action=upload&mime=image/jpeg
// @access Private
const getSignedURL = asyncHandler(async (req, res, next) => {
  const { fileName, type, action, mime = "application/octet-stream" } = req.query
  const sanitizeFilename = (name) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-") // spaces to dashes
      .replace(/[^a-z0-9._-]/g, "") // optional: strip non-safe characters
  }
  const safeFileName = sanitizeFilename(fileName)
  const allowedTypes = ["profile", "media", "kyc"]
  const allowedActions = ["upload", "download"]

  if (!fileName || typeof fileName !== "string") {
    return res.status(400).json({ error: "Invalid or missing 'filename' parameter" })
  }

  if (!allowedTypes.includes(type)) {
    return res.status(400).json({
      error: "Invalid 'type' parameter",
      message: `Allowed types: ${allowedTypes.join(", ")}`,
    })
  }

  if (!allowedActions.includes(action)) {
    return res.status(400).json({
      error: "Invalid 'action' parameter",
      message: `Allowed actions: ${allowedActions.join(", ")}`,
    })
  }

  const bucket = type === "profile" ? process.env.WASABI_PROFILE_IMAGE_BUCKET : process.env.WASABI_KYC_BUCKET

  try {
    const key = type === "profile" ? safeFileName : `${req.user.id}/${safeFileName}`
    const signedUrl = await generateSignedUrl(key, bucket, action, mime)
    const publicUrl = `https://${bucket}.${process.env.WASABI_SERVICE_URL}/${key}`
    res.status(200).json({ signedUrl, publicUrl })
  } catch (error) {
    console.error("Error generating signed URL:", error)
    error.statusCode = 500
    next(error)
  }
})
//#endregion

//#region @desc Generate KYC FORM
// @route POST /user/kyc
// @access Private
const submitKyc = asyncHandler(async (req, res) => {
  const userId = req.user._id

  const { personalInfo, idDocument, selfie, kycConfirm } = req.body

  // Validate required fields
  if (!personalInfo || !idDocument || !selfie || !kycConfirm) {
    res.status(400)
    throw new Error("Missing required KYC fields.")
  }

  const existing = await KYC.findOne({ user: userId })
  if (existing) {
    res.status(409)
    throw new Error("KYC already submitted.")
  }

  const kyc = await KYC.create({
    user: userId,
    personalInfo,
    idDocument,
    selfie,
    kycConfirm,
  })
  await User.updateOne(
    { _id: userId },
    {
      $set: { kycVerification: "pending" },
    }
  )
  res.status(201).json({ message: "KYC submitted successfully", kycVerification: "pending" })
})
//#endregion

//#region @desc Review Kyc
// @route POST /user/admin/kyc
// @access Private
const reviewKyc = asyncHandler(async (req, res) => {
  const { action, notes, kycId } = req.body

  if (!["approved", "rejected"].includes(action)) {
    res.status(400)
    throw new Error("Invalid review action. Must be 'approved' or 'rejected'.")
  }

  const kyc = await KYC.findById(kycId).populate("user", "_id email firstName lastName")

  if (!kyc) {
    res.status(404)
    throw new Error("KYC record not found.")
  }

  if (kyc.status !== "pending") {
    res.status(400)
    throw new Error("This KYC has already been reviewed.")
  }

  kyc.status = action
  kyc.adminNotes = notes || ""
  kyc.reviewedAt = new Date()

  await kyc.save()

  // Send email notification to user
  const { email, firstName } = kyc.user
  const subject = `Your KYC has been ${action}`
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #333;">KYC ${action.charAt(0).toUpperCase() + action.slice(1)}</h2>
      <p>Hello ${firstName || "User"},</p>
      <p>Your KYC verification has been <strong>${action}</strong>.</p>
      ${action === "rejected" ? `<p>Reason: ${notes || "Not specified."}</p>` : ""}
      <p>If you have any questions, feel free to contact our support(support@lepgold.com). </p>
      <br />
      <p style="font-size: 12px; color: #777;">&copy; ${new Date().getFullYear()} PROJECT</p>
    </div>
  `

  const textBody = `Hello ${firstName || "User"}, your KYC verification has been ${action}. ${
    action === "rejected" ? `Reason: ${notes || "Not specified."}` : ""
  }`

  await sendEmail({
    to: email,
    subject,
    htmlBody,
    textBody,
  })
  privateNamespace.to(kyc.user._id.toString()).emit("kycUpdate", { status: action })
  res.json({
    message: `KYC ${action}`,
    kyc,
  })
})
//#endregion

//#region @desc Get kyc list for processing
// @route GET /admin/kyc?status=pending&page=1&limit=15
// @access Private
const getAllKyc = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query

  const query = {}
  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query.status = status
  }

  const total = await KYC.countDocuments(query)
  const kycList = await KYC.find(query)
    .populate("user", "firstName lastName email")
    .lean()
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit))

  const signedKycList = await Promise.all(
    kycList.map(async (kyc) => {
      const signedFront = await generateSignedUrl(kyc.idDocument.frontImageUrl, process.env.WASABI_KYC_BUCKET, "download")
      const signedBack = await generateSignedUrl(kyc.idDocument.backImageUrl, process.env.WASABI_KYC_BUCKET, "download")
      const signedPhoto = await generateSignedUrl(kyc.selfie?.photoUrl, process.env.WASABI_KYC_BUCKET, "download")
      const signedVideo = await generateSignedUrl(kyc.selfie?.videoUrl, process.env.WASABI_KYC_BUCKET, "download")

      return {
        ...kyc.toObject(),
        idDocument: {
          ...kyc.idDocument,
          frontImageUrl: signedFront,
          backImageUrl: signedBack,
        },
        selfie: {
          ...kyc.selfie,
          photoUrl: signedPhoto,
          videoUrl: signedVideo,
        },
      }
    })
  )

  res.json({
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / limit),
    data: signedKycList,
  })
})
//#endregion

//#region @desc Initiate password reset process
// @route POST /user/password-reset-init
// @access Public
const passwordResetInit = asyncHandler(async (req, res) => {
  const { email } = req.body

  if (!email) {
    res.status(400)
    throw new Error("Email is required.")
  }

  const user = await User.findOne({ email }).lean()
  if (!user) {
    res.status(404)
    throw new Error("No user found with that email.")
  }
  const resetCode = [...Array(8)].map(() => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("")

  const key = `password-reset:${email}`
  const tempUserData = {
    key,
    value: resetCode,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 mins expiry
  }

  const existing = await Redis.findOne({ key }).lean()
  if (existing) {
    await Redis.updateOne({ key }, { $set: tempUserData })
  } else {
    await Redis.create(tempUserData)
  }

  const subject = "Your Password Reset Code"
  const textBody = `Your password reset code is: ${resetCode}`
  const htmlBody = `<p>Your password reset code is:</p><h2>${resetCode}</h2><p>This code expires in 5 minutes.</p>`

  await sendEmail({
    to: email,
    subject,
    htmlBody,
    textBody,
  })

  res.status(200).json({
    message: "Check your email for the password reset code.",
  })
})
//#endregion

//#region @desc Reset password with verification code
// @route POST /user/password-reset
// @access Public
const passwordReset = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body

  if (!email || !code || !password) {
    return res.status(400).json({ message: "Email, code, and new password are required." })
  }

  const redisRecord = await Redis.findOne({ key: `password-reset:${email}` })
  if (!redisRecord) {
    return res.status(400).json({ message: "Reset code expired or not found." })
  }

  const isMatch = await redisRecord.verifyCode(code)
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid reset code." })
  }

  const user = await User.findOne({ email })
  if (!user) {
    return res.status(404).json({ message: "User not found." })
  }

  await user.resetPassword(password)
  await redisRecord.deleteOne()

  const subject = "Your password was successfully changed"

  const now = new Date()
  const formattedTime = now.toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: "America/Jamaica", // adjust based on your system or user preference
  })

  const textBody = `
Your password was successfully changed on ${formattedTime}.
If this wasn't you, please secure your account immediately by contacting support.
`

  const htmlBody = `
  <p>Hi there,</p>
  <p>Your password was <strong>successfully changed</strong> on:</p>
  <p><strong>${formattedTime}</strong></p>
  <p>If this wasn't you, please <a href="mailto:support@PROJECT.com">contact support</a> immediately.</p>
  <br />
  <p>Thanks,<br/>The Security Team</p>
`

  await sendEmail({
    to: email,
    subject,
    htmlBody,
    textBody,
  })

  return res.status(200).json({ message: "Password reset successful." })
})
//#endregion

export {
  authUser,
  registerUser,
  sendVerificationOtp,
  verifyOtp,
  getAllKyc,
  getUserProfile,
  getUserNotifications,
  updateUserProfile,
  updateActionTaken,
  updateNotificationViewState,
  submitKyc,
  reviewKyc,
  passwordResetInit,
  passwordReset,
  getSignedURL,
  updateProfileImage,
  getAuthData,
  getUserTempData,
}
