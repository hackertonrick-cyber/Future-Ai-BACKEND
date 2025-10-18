import jwt from "jsonwebtoken"
import rateLimit from "express-rate-limit"
import asyncHandler from "express-async-handler"
import { ERROR_RESPONSE } from "../utils/constants.js"
import OrgUser from "../models/orgUserModel.js"

const protect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await OrgUser.findById(decoded.id).select("-password -createdBy -updatedBy")

      next()
    } catch (error) {
      console.error(error)
      res.status(401)
      throw new Error(ERROR_RESPONSE.FAILED_AUTH)
    }
  }

  if (!token) {
    res.status(401)
    throw new Error(ERROR_RESPONSE.FAILED_AUTH)
  }
})

const protectOrg = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]

      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const orgUser = await OrgUser.findById(decoded.id).select("-passwordHash")

      if (!orgUser) {
        return res.status(401).json({ message: "Unauthorized: OrgUser not found" })
      }

      req.user = orgUser
      next()
    } catch (error) {
      console.error("Auth Error:", error)
      return res.status(401).json({ message: "Invalid or expired token" })
    }
  } else {
    res.status(401).json({ message: "No authorization token provided" })
  }
})

const protectAdmin = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      const orgUser = await OrgUser.findById(decoded.id).select("-passwordHash")

      if (!orgUser || orgUser.role !== "super-admin") {
        return res.status(401).json({ message: "Unauthorized: Super-admin access required" })
      }
      // Attach user to request
      req.user = orgUser
      next()
    } catch (error) {
      console.error("Auth Error:", error)
      return res.status(401).json({ message: "Invalid or expired token" })
    }
  } else {
    return res.status(401).json({ message: "No authorization token provided" })
  }
})

// 📌 Global Rate Limiting (Prevent Spam & DoS)
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Max 50 requests per 5 minutes per IP
  message: "Too many requests. Please try again later.",
})

export { protect, protectOrg, protectAdmin, apiLimiter }
