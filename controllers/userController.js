import asyncHandler from "express-async-handler"
import generateOrgAuthData from "../utils/generateOrgAuthData.js"
import { ERROR_RESPONSE } from "../utils/constants.js"
import { differenceInCalendarYears, parse } from "date-fns"
import mongoose from "mongoose"
import { sendEmail } from "../middleware/s3.js"
import { sendNotification } from "../utils/notificationService.js"
import Counter from "../models/counterModel.js"
import Organization from "../models/organizationModel.js"
import OrgUser from "../models/orgUserModel.js"
import AccessRequest from "../models/accessRequestModel.js"
import RedisTemp from "../models/redis_temp.js"
import * as crypto from "crypto"
import Patient from "../models/patientModel.js"
import MedicalProfessional from "../models/medicalProfessionalModel.js"
import generateToken from "../utils/generateToken.js"
import generatePatientAuthData from "../utils/generatePatientAuthData.js"

const createOrganizationInvite = asyncHandler(async (req, res) => {
  const { companyName, country, address, contactEmail, contactPhone } = req.body

  // Basic validation
  if (!companyName || !contactEmail || !country) {
    return res.status(400).json({ message: "Missing required organization fields." })
  }

  // Generate a unique token (you can also hash this before saving)
  const token = crypto.randomBytes(20).toString("hex")

  // Construct temporary invite data
  const inviteData = {
    companyName,
    country,
    address,
    contactEmail,
    contactPhone,
    invitedBy: req.user._id,
  }

  // Store in RedisModel with TTL (5 minutes default)
  await RedisTemp.create({
    key: token,
    value: inviteData,
  })

  // Generate registration link
  const registrationLink = `${process.env.FRONTEND_URL}/org/register?token=${token}`

  // Send notification (customize this to your own notification system)
  await sendNotification({
    userEmail: contactEmail,
    type: "organization_invite",
    subject: `You're invited to join MedSync`,
    message: `Hello,  
You’ve been invited to register your hospital or clinic on the MedSync Network.  
Click the link below to complete your registration:  
${registrationLink}

This link will expire in 5 minutes for security reasons.`,
    from: {
      userName: "MedSync System",
      avatar: process.env.ADMIN_IMAGE,
    },
    actions: [
      {
        type: "REGISTER_ORG",
        text: "Complete Registration",
        url: registrationLink,
      },
    ],
  })

  // Return success + link for audit
  res.status(201).json({
    message: "Organization invite created successfully.",
    token,
    registrationLink,
  })
})

const registerOrganization = asyncHandler(async (req, res) => {
  const { address, contactEmail, branchName, adminEmail, adminPassword, inviteToken } = req.body

  let redisRecord = null
  if (inviteToken) {
    redisRecord = await RedisTemp.findOne({ key: inviteToken })
    if (!redisRecord) {
      return res.status(403).json({ message: "Invalid or expired invite token." })
    }
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  let committed = false

  try {
    const inviteData = redisRecord?.value || {}

    const existingOrg = await Organization.findOne({
      contactEmail: inviteData.contactEmail || contactEmail,
    }).session(session)
    if (existingOrg) throw new Error("Organization already registered.")

    const orgCount = await Organization.countDocuments().session(session)
    const companyCode = "HSP" + String(orgCount + 1).padStart(3, "0")
    const branchCode = "BR001"

    const [createdOrg] = await Organization.create(
      [
        {
          companyCode,
          companyName: inviteData.companyName,
          country: inviteData.country,
          address: inviteData.address,
          contactEmail: inviteData.contactEmail,
          contactPhone: inviteData.contactPhone,
          registrationStatus: "approved",
          verified: true,
          verifiedAt: new Date(),
          branches: [
            {
              branchCode,
              branchName: branchName || "MB",
              address,
              email: inviteData.contactEmail,
              phone: inviteData.contactPhone,
            },
          ],
        },
      ],
      { session }
    )

    const adminUser = await OrgUser.create(
      [
        {
          companyCode,
          branchCode,
          username: adminEmail.toLowerCase(),
          passwordHash: adminPassword,
          role: "admin",
          active: true,
        },
      ],
      { session }
    )

    await Organization.findByIdAndUpdate(
      createdOrg._id,
      { primaryAdminUser: adminUser[0]._id },
      { session }
    )

    if (redisRecord) await redisRecord.deleteOne()
    await session.commitTransaction()
    committed = true // ✅ prevent abort after commit

    return res.status(201).json({
      organization: {
        _id: createdOrg._id,
        companyCode,
        companyName: createdOrg.companyName,
        contactEmail: createdOrg.contactEmail,
        token: generateToken(adminUser[0]._id),
      },
    })
  } catch (err) {
    if (!committed) {
      try {
        await session.abortTransaction()
      } catch (abortErr) {
        console.error("Abort transaction failed:", abortErr)
      }
    }
    console.error("RegisterOrganization Error:", err)
    res.status(500).json({ message: err.message })
  } finally {
    session.endSession()
  }
})

//#region @desc Register new user
// @route POST /user
// @access Public
const registerUser = asyncHandler(async (req, res) => {
  const { username, googleId, location, firstName, lastName, gender, dob, email, country, termsCondition, newsLetters, password } = req.body

  if (!googleId && !password) {
    throw new Error("Either Google ID or password is required")
  }
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
      const existingUser = await Patient.findOne({
        $or: [{ username }, { email }],
      })
        .collation({ locale: "en_US", strength: 2 })
        .session(session)

      if (existingUser) {
        throw new Error(ERROR_RESPONSE.USER_ALREADY_EXIST)
      }
      const newUserData = {
        username: username.toLowerCase(),
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
        passwordHash:password,
        avatar: process.env.LEPRECHAUN_IMAGE,
        createdBy: email.toLowerCase(),
      }

      if (typeof googleId === "string" && googleId.trim()) {
        newUserData.googleId = googleId.trim()
      }

      const [createdUser] = await Patient.create([newUserData], { session })

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
        username: createdUser.username,
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
        avatar: createdUser.avatar,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt,
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

const registerOrgUser = asyncHandler(async (req, res) => {
  const { username, password, role, branchCode, firstName, lastName, gender, email, phone, profession, specialization } = req.body
  const admin = req.user

  // 🧩 Validate Inputs
  if (!username || !password || !role || !firstName || !lastName) {
    return res.status(400).json({ message: "Required fields: username, password, role, firstName, lastName." })
  }

  // 🛡️ Role Check
  if (!["admin", "super-admin"].includes(admin.role)) {
    return res.status(403).json({ message: "Only admins or super-admins can create users." })
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // 🔍 Check for duplicate username in same org
    const existingUser = await OrgUser.findOne({
      username: username.toLowerCase(),
      companyCode: admin.companyCode,
    }).session(session)

    if (existingUser) {
      throw new Error("Username already exists in your organization.")
    }

    // 🔒 Role constraint: only super-admins can create another super-admin
    if (role === "super-admin" && admin.role !== "super-admin") {
      throw new Error("Only super-admins can create another super-admin.")
    }

    // 🧱 Create OrgUser
    const [newUser] = await OrgUser.create(
      [
        {
          companyCode: admin.companyCode,
          branchCode: branchCode || admin.branchCode,
          username: username.toLowerCase(),
          passwordHash: password,
          role,
          createdBy: admin._id,
          active: true,
        },
      ],
      { session }
    )

    // 🧩 Create corresponding MedicalProfessional (if role is clinical)
    const clinicalRoles = ["doctor", "nurse", "technician", "therapist", "pharmacist"]
    if (clinicalRoles.includes(role)) {
      await MedicalProfessional.create(
        [
          {
            firstName,
            lastName,
            gender: gender || "other",
            profession: role, // aligns with OrgUser role
            specialization,
            companyCode: admin.companyCode,
            branchCode: branchCode || admin.branchCode,
            orgUserId: newUser._id,
            email,
            phone,
            active: true,
            verified: false,
          },
        ],
        { session }
      )
    }

    await session.commitTransaction()

    res.status(201).json({
      message: "Organization user registered successfully.",
      user: {
        _id: newUser._id,
        username: newUser.username,
        role: newUser.role,
        companyCode: newUser.companyCode,
        branchCode: newUser.branchCode,
        createdBy: admin.username,
      },
    })
  } catch (error) {
    await session.abortTransaction()
    console.error("OrgUser Registration Error:", error)
    res.status(500).json({ message: error.message })
  } finally {
    session.endSession()
  }
})

const registerSuperAdmin = asyncHandler(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" })
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  let committed = false

  try {
    // Ensure no duplicate super-admin exists
    const existing = await OrgUser.findOne({ username: username.toLowerCase(), role: "super-admin" }).session(session)
    if (existing) {
      throw new Error("A super-admin with this username already exists.")
    }

    // Create super-admin
    const superAdmin = await OrgUser.create(
      [
        {
          username: username.toLowerCase(),
          passwordHash: password,
          role: "super-admin",
          companyCode: "SYS-ROOT",
          branchCode: "GLOBAL",
          active: true,
        },
      ],
      { session }
    )

    await session.commitTransaction()
    committed = true // ✅ mark as committed

    const token = generateToken(superAdmin[0]._id)

    return res.status(201).json({
      message: "Super-admin registered successfully.",
      user: {
        _id: superAdmin[0]._id,
        username: superAdmin[0].username,
        role: superAdmin[0].role,
        companyCode: superAdmin[0].companyCode,
        branchCode: superAdmin[0].branchCode,
        token,
      },
    })
  } catch (error) {
    // only abort if not committed yet
    if (!committed) {
      await session.abortTransaction().catch((abortErr) => console.error("Abort transaction failed:", abortErr))
    }
    console.error("SuperAdmin Registration Error:", error)
    return res.status(500).json({ message: error.message })
  } finally {
    session.endSession()
  }
})

//#region @desc Auth user & get token
// @route POST /org/login
// @access Public
const authOrgUser = asyncHandler(async (req, res) => {
  const { username, password, companyCode, branchCode } = req.body

  try {
    if (!username || !password || !companyCode) {
      return res.status(400).json({
        error: ERROR_RESPONSE.INVALID_REQUEST,
        message: "Username, password, and company code are required.",
      })
    }

    // 🔹 Step 1: Find Org User by company + username
    const user = await OrgUser.findOne({
      username: username.toLowerCase(),
      companyCode,
    }).collation({ locale: "en_US", strength: 2 })

    if (!user) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🔹 Step 2: Verify password
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🔹 Step 3: Ensure organization is active
    const org = await Organization.findOne({ companyCode, isActive: true })
    if (!org) {
      return res.status(403).json({
        message: "Organization inactive or not found.",
      })
    }

    // 🔹 Step 4: Update login activity
    if (!user.loginHistory) user.loginHistory = []
    user.lastLogin = new Date()
    user.loginHistory.push({
      ip: req.ip || "192.168.40.40",
      device: req.headers["user-agent"] || "doctor-device",
      timestamp: new Date(),
    })
    await user.save()

    // 🔹 Step 5: Generate org auth payload
    const authData = generateOrgAuthData(user)

    // 🔹 Step 6: Respond
    res.status(200).json({
      message: "Login successful",
      user: authData,
    })
  } catch (error) {
    console.error("Auth error:", error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: "Internal authentication error",
    })
  }
})
//#endregion

const authSuperAdmin = asyncHandler(async (req, res) => {
  const { username, password } = req.body

  try {
    if (!username || !password) {
      return res.status(400).json({
        error: ERROR_RESPONSE.INVALID_REQUEST,
        message: "Username and password are required.",
      })
    }

    // 🔹 Step 1: Find user with role = super-admin
    const user = await OrgUser.findOne({
      username: username.toLowerCase(),
      role: "super-admin",
    }).collation({ locale: "en_US", strength: 2 })

    if (!user) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🔹 Step 2: Validate password
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🔹 Step 3: Optional — log activity
    if (!user.loginHistory) user.loginHistory = []
    user.lastLogin = new Date()
    user.loginHistory.push({
      ip: req.ip || "0.0.0.0",
      device: req.headers["user-agent"] || "super-admin-console",
      timestamp: new Date(),
    })
    await user.save()

    // 🔹 Step 4: Generate token and response
    const authData = generateOrgAuthData(user)

    res.status(200).json({
      message: "Super-admin login successful",
      user: authData,
    })
  } catch (error) {
    console.error("SuperAdmin Auth Error:", error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: "Internal authentication error",
    })
  }
})

const authPatient = asyncHandler(async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required." })
  }

  try {
    // 🔍 Find patient by username OR email
    const patient = await Patient.findOne({
      $or: [{ username }, { email: username }],
    })

    if (!patient) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🔑 Validate password
     const isMatch = await patient.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({
        error: ERROR_RESPONSE.FAILED_AUTH,
        message: "Invalid username or password.",
      })
    }

    // 🕒 Update login activity
    patient.lastLogin = new Date()
    patient.loginHistory.push({
      ip: req.ip || "192.168.10.10",
      device: req.headers["user-agent"] || "test device",
      timestamp: new Date(),
    })
    await patient.save()

    // 🎫 Generate clean response data + JWT
    const authData = generatePatientAuthData(patient)

    res.status(200).json({
      message: "Login successful",
      patient: authData,
    })
  } catch (error) {
    console.error("Patient Auth Error:", error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: "An internal error occurred while logging in.",
    })
  }
})

const getOrgUserProfile = asyncHandler(async (req, res) => {
  try {
    const id = req.body.id || req.user._id

    // 🔹 Fetch base org user
    const user = await OrgUser.findById(id)
      .select("-passwordHash -__v")
      .lean()

    if (!user) {
      return res.status(404).json({
        error: ERROR_RESPONSE.USER_NOT_FOUND,
        message: "Organization user not found",
      })
    }

    // 🔹 Fetch linked professional profile (if it exists)
    const professional = await MedicalProfessional.findOne({
      orgUserId: user._id,
    })
      .select("-__v -createdAt -updatedAt")
      .lean()

    // ✅ Merge both sets of data
    const profile = {
      ...user,
      isAdmin: user.role === "admin",
      companyCode: user.companyCode,
      branchCode: user.branchCode,
      role: user.role,
      professionalProfile: professional || null,
    }

    return res.status(200).json(profile)
  } catch (error) {
    console.error("Error fetching org user profile:", error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `Failed to retrieve org user profile: ${error.message}`,
    })
  }
})

const getOrganizationsList = asyncHandler(async (req, res) => {
  const requester = req.user
  const { country, search, includeBranches } = req.query

  // 🔹 Base query — only active, verified organizations
  const query = { isActive: true, verified: true }

  // Optional country filter
  if (country) query.country = country

  // Optional text search (companyName or companyCode)
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: "i" } },
      { companyCode: { $regex: search, $options: "i" } },
    ]
  }

  // 🔹 Role-based visibility
  if (requester?.role === "patient") {
    // Patients should only see approved/verified organizations
    query.registrationStatus = "approved"
  } else if (["doctor", "nurse", "admin", "technician"].includes(requester?.role)) {
    // Medical staff can also see pending ones (for potential collaboration)
    query.registrationStatus = { $in: ["approved", "pending"] }
  } else if (requester?.role === "super-admin") {
    // Full visibility for super admins
    delete query.verified
    delete query.isActive
  }

  // 🔹 Projection (lightweight for patients)
  const projection =
    requester?.role === "patient"
      ? {
          companyCode: 1,
          companyName: 1,
          country: 1,
          address: 1,
          contactEmail: 1,
          contactPhone: 1,
          website: 1,
          branches: includeBranches ? 1 : 0,
        }
      : {}

  const organizations = await Organization.find(query, projection).sort({ companyName: 1 })

  if (!organizations.length) {
    return res.status(404).json({ message: "No organizations found." })
  }

  res.json({
    count: organizations.length,
    organizations,
  })
})

const getPatientProfile = asyncHandler(async (req, res) => {
  try {
    const patientId = req.params.id || req.user._id
    const requester = req.user

    const patient = await Patient.findById(patientId)
      .select("-passwordHash -__v")
      .populate([
        { path: "country", select: "name code" },
        { path: "restrictedAccess.doctors", select: "username role companyCode branchCode" },
      ])
      .lean()

    if (!patient) {
      return res.status(404).json({
        error: ERROR_RESPONSE.USER_NOT_FOUND,
        message: "Patient not found",
      })
    }

    // 🔒 Access Control Logic
    const isSelf = requester._id.toString() === patient._id.toString()
    const isDoctorAuthorized =
      patient.restrictedAccess?.doctors?.some((doc) => doc._id.toString() === requester._id.toString()) || requester.role === "admin"

    const isMedicalStaff = ["doctor", "nurse", "admin", "technician"].includes(requester.role)

    if (!isSelf && !isDoctorAuthorized && !isMedicalStaff) {
      return res.status(403).json({
        error: ERROR_RESPONSE.ACCESS_DENIED,
        message: "You are not authorized to view this patient’s record",
      })
    }

    // ✅ Response
    res.status(200).json({
      patient,
      accessedBy: {
        userId: requester._id,
        role: requester.role || "patient",
        companyCode: requester.companyCode || null,
        selfAccess: isSelf,
      },
    })
  } catch (error) {
    console.error("getPatientProfile error:", error)
    res.status(500).json({
      error: ERROR_RESPONSE.FAILED,
      message: `Failed to retrieve patient profile: ${error.message}`,
    })
  }
})

const requestAccessFromOrganization = asyncHandler(async (req, res) => {
  const { targetOrgCode, patientId, reasonForAccess, requestedCategories, priority } = req.body

  // 🔍 Validate required inputs
  if (!targetOrgCode || !reasonForAccess || !patientId) {
    return res.status(400).json({
      message: "Organization code, patient ID, and reason for access are required.",
    })
  }

  const requester = req.user

  // 🔒 Restrict to authorized roles
  if (!["doctor", "nurse", "admin", "technician"].includes(requester.role)) {
    return res.status(403).json({ message: "Only medical professionals can request access." })
  }

  // 🔹 Verify target organization
  const organization = await Organization.findOne({ companyCode: targetOrgCode, isActive: true })
  if (!organization) {
    return res.status(404).json({ message: "Target organization not found or inactive." })
  }

  // 🔹 Verify patient exists
  const patient = await Patient.findById(patientId)
  if (!patient) {
    return res.status(404).json({ message: "Patient record not found." })
  }

  // 🔹 Get the requester’s professional profile
  const professional = await MedicalProfessional.findOne({ orgUserId: requester._id })
  if (!professional) {
    return res.status(400).json({
      message: "Requester does not have a medical professional profile.",
    })
  }

  // 🔹 Prevent duplicate open requests for the same patient + organization
  const existingRequest = await AccessRequest.findOne({
    patientId,
    requesterProfessionalId: professional._id,
    targetOrgCode,
    status: { $in: ["pending", "approved"] },
  })

  if (existingRequest) {
    return res.status(409).json({
      message: `An active access request for this patient already exists with ${targetOrgCode}.`,
    })
  }

  // 🔹 Create new patient-specific access request
  const newRequest = await AccessRequest.create({
    patientId,
    requesterProfessionalId: professional._id,
    requesterOrgCode: requester.companyCode,
    requesterBranchCode: requester.branchCode,
    targetOrgCode, // ✅ explicitly record target organization
    requestedCategories: requestedCategories?.length
      ? requestedCategories
      : [{ category: "notes", reason: reasonForAccess }],
    justification: reasonForAccess,
    status: "pending",
    priority: priority || "normal",
    requestedAt: new Date(),
  })

  // 🔔 Notify target organization admins
  const orgAdmins = await Organization.aggregate([
    { $match: { companyCode: targetOrgCode } },
    {
      $lookup: {
        from: "orgusers",
        localField: "companyCode",
        foreignField: "companyCode",
        as: "admins",
      },
    },
    { $unwind: "$admins" },
    { $match: { "admins.role": "admin" } },
    { $project: { "admins._id": 1, "admins.username": 1 } },
  ])

  for (const admin of orgAdmins) {
    await sendNotification({
      userId: admin.admins._id,
      type: "access_request_org",
      subject: "New Patient Data Access Request",
      message: `${requester.username} from ${requester.companyCode} has requested access to patient data (${patient.firstName} ${patient.lastName}) at ${organization.companyName}.`,
      from: {
        _id: requester._id,
        userName: requester.username,
        avatar: process.env.ADMIN_IMAGE,
      },
      actions: [
        {
          type: "REVIEW_ACCESS",
          text: "Review Request",
          url: `${process.env.FRONTEND_URL}/admin/access-requests`,
        },
      ],
    })
  }

  // ✅ Respond cleanly
  res.status(201).json({
    message: `Access request for patient ${patient.firstName} ${patient.lastName} sent to ${organization.companyName}.`,
    request: {
      _id: newRequest._id,
      patientId: newRequest.patientId,
      requesterProfessionalId: newRequest.requesterProfessionalId,
      requesterOrgCode: newRequest.requesterOrgCode,
      targetOrgCode: newRequest.targetOrgCode, // ✅ now visible in response
      requestedCategories: newRequest.requestedCategories,
      justification: newRequest.justification,
      status: newRequest.status,
      priority: newRequest.priority,
    },
  })
})

const listAccessRequests = asyncHandler(async (req, res) => {
  const requester = req.user

  if (requester.role !== "admin") {
    return res.status(403).json({ message: "Access denied: Admins only." })
  }

  try {
    // Admin can only view requests within their own organization
    const { status } = req.query // optional filter

    const query = {
      targetOrgCode: requester.companyCode,
    }

    if (status) query.status = status // e.g., ?status=scheduled or confirmed

    const requests = await AccessRequest.find(query)
      .populate([
        { path: "requesterProfessionalId", select: "username role companyCode branchCode" },
        { path: "patientId", select: "firstName lastName email" },
      ])
      .sort({ createdAt: -1 })
      .lean()

    if (!requests.length) {
      return res.status(404).json({ message: "No access requests found for your organization." })
    }

    res.status(200).json({
      count: requests.length,
      requests,
    })
  } catch (error) {
    console.error("List Access Requests Error:", error)
    res.status(500).json({
      message: "Failed to retrieve access requests.",
      error: error.message,
    })
  }
})

const approveAccessRequest = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { decision } = req.body // "approved" or "rejected"
  const admin = req.user

  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ message: "Decision must be 'approved' or 'rejected'." })
  }

  try {
    const accessRequest = await AccessRequest.findById(id)
      .populate("requesterProfessionalId", "username companyCode branchCode")
      .populate("patientId", "firstName lastName restrictedAccess")
      .lean()

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found." })
    }

    // Ensure admin is approving within their organization
    if (accessRequest.orgCode !== admin.companyCode) {
      return res.status(403).json({ message: "You cannot modify requests outside your organization." })
    }

    // Update status
    const updated = await AccessRequest.findByIdAndUpdate(
      id,
      { status: decision === "approved" ? "confirmed" : "cancelled", updatedBy: admin._id },
      { new: true }
    )

    // If approved, grant access
    if (decision === "approved" && accessRequest.patientId) {
      await Patient.findByIdAndUpdate(accessRequest.patientId._id, {
        $addToSet: { "restrictedAccess.doctors": accessRequest.requesterProfessionalId._id },
      })

      await sendNotification({
        userId: accessRequest.requesterProfessionalId._id,
        type: "access_approved",
        subject: "Access Approved",
        message: `Your access request for patient ${accessRequest.patientId.firstName} ${accessRequest.patientId.lastName} has been approved by ${admin.username}.`,
        from: {
          _id: admin._id,
          userName: admin.username,
          avatar: process.env.ADMIN_IMAGE,
        },
      })
    }

    // If rejected, notify doctor
    if (decision === "rejected") {
      await sendNotification({
        userId: accessRequest.requesterProfessionalId._id,
        type: "access_denied",
        subject: "Access Request Denied",
        message: `Your request for access was denied by ${admin.username}.`,
        from: {
          _id: admin._id,
          userName: admin.username,
          avatar: process.env.ADMIN_IMAGE,
        },
      })
    }

    res.status(200).json({
      message: `Access request ${decision === "approved" ? "approved" : "rejected"} successfully.`,
      updated,
    })
  } catch (error) {
    console.error("Approve Access Error:", error)
    res.status(500).json({
      message: "Failed to process access request.",
      error: error.message,
    })
  }
})

const disapproveAccessRequest = asyncHandler(async (req, res) => {
  const { id } = req.params
  const admin = req.user

  try {
    const accessRequest = await AccessRequest.findById(id)
      .populate("requesterProfessionalId", "username companyCode branchCode")
      .populate("patientId", "firstName lastName restrictedAccess")
      .lean()

    if (!accessRequest) {
      return res.status(404).json({ message: "Access request not found." })
    }

    // ✅ Ensure admin has the right organization
    if (accessRequest.orgCode !== admin.companyCode) {
      return res.status(403).json({ message: "You cannot modify requests outside your organization." })
    }

    // ✅ Revoke doctor’s access
    await Patient.findByIdAndUpdate(accessRequest.patientId._id, {
      $pull: { "restrictedAccess.doctors": accessRequest.requesterProfessionalId._id },
    })

    // ✅ Mark AccessRequest as revoked
    const updated = await AccessRequest.findByIdAndUpdate(id, { status: "revoked", updatedBy: admin._id, updatedAt: new Date() }, { new: true })

    // ✅ Notify doctor
    await sendNotification({
      userId: accessRequest.requesterProfessionalId._id,
      type: "access_revoked",
      subject: "Access Revoked",
      message: `Your access to patient ${accessRequest.patientId.firstName} ${accessRequest.patientId.lastName} has been revoked by ${admin.username}.`,
      from: {
        _id: admin._id,
        userName: admin.username,
        avatar: process.env.ADMIN_IMAGE,
      },
    })

    res.status(200).json({
      message: `Access revoked successfully for doctor ${accessRequest.requesterProfessionalId.username}.`,
      updated,
    })
  } catch (error) {
    console.error("Disapprove Access Error:", error)
    res.status(500).json({
      message: "Failed to revoke access.",
      error: error.message,
    })
  }
})

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
      Notification.find({ userId })
        .sort({ createdAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ userId }),
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
  const { notification_ids } = req.body

  if (!Array.isArray(notification_ids) || notification_ids.length === 0) {
    return res.status(400).json({ message: "No notification IDs provided." })
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const userId = req.user._id

    const result = await Notification.updateMany(
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
    const notification = await Notification.findOneAndUpdate(
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

//#region @desc Initiate password reset process
// @route POST /user/password-reset-init
// @access Public
const passwordResetInit = asyncHandler(async (req, res) => {
  const { email } = req.body

  if (!email) {
    res.status(400)
    throw new Error("Email is required.")
  }

  const user = await Patient.findOne({ email }).lean()
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

  const existing = await RedisTemp.findOne({ key }).lean()
  if (existing) {
    await RedisTemp.updateOne({ key }, { $set: tempUserData })
  } else {
    await RedisTemp.create(tempUserData)
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

  const redisRecord = await RedisTemp.findOne({ key: `password-reset:${email}` })
  if (!redisRecord) {
    return res.status(400).json({ message: "Reset code expired or not found." })
  }

  const isMatch = await redisRecord.verifyCode(code)
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid reset code." })
  }

  const user = await Patient.findOne({ email })
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
  authOrgUser,
  authPatient,
  authSuperAdmin,
  getOrgUserProfile,
  getPatientProfile,
  requestAccessFromOrganization,
  listAccessRequests,
  approveAccessRequest,
  disapproveAccessRequest,
  createOrganizationInvite,
  registerOrganization,
  registerUser,
  registerSuperAdmin,
  getOrganizationsList,
  registerOrgUser,
  getUserNotifications,
  updateActionTaken,
  updateNotificationViewState,
  passwordResetInit,
  passwordReset,
}
