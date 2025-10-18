import jwt from "jsonwebtoken"
import rateLimit from "express-rate-limit"
import asyncHandler from "express-async-handler"
import User from "../models/userModel.js"
import { ERROR_RESPONSE } from "../utils/constants.js"
import Redis from "../models/redisModel.js"

const protect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select("-password -createdBy -updatedBy")

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

/**
 * Middleware to protect temp data routes by checking token and strict key prefix.
 * @param {'signup' | 'login' | 'reset'} type - Only allow valid enum-like prefix
 */
const protectTemp = (type) =>
  asyncHandler(async (req, res, next) => {
    const allowedPrefixes = ["signup", "sign_in"] // your allowed enums

    if (!allowedPrefixes.includes(type)) {
      res.status(400)
      throw new Error(`Invalid temp data type: '${type}'`)
    }

    let token

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      try {
        token = req.headers.authorization.split(" ")[1]
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        const redisKey = `${type}:${decoded.email}`
        const redisData = await Redis.findOne({ key: redisKey })

        if (!redisData) {
          res.status(404)
          throw new Error("Temporary data not found or expired")
        }

        req.data = redisData.value
        return next()
      } catch (error) {
        console.error("ProtectTemp middleware error:", error.message)
        res.status(401)
        throw new Error(ERROR_RESPONSE.FAILED_AUTH)
      }
    }

    res.status(401)
    throw new Error(ERROR_RESPONSE.FAILED_AUTH)
  })

// 📌 Global Rate Limiting (Prevent Spam & DoS)
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // Max 50 requests per 5 minutes per IP
  message: "Too many requests. Please try again later.",
})

const semiProtect = asyncHandler(async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer") && !req.headers.authorization.endsWith("undefined")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      req.user = await User.findById(decoded.id).select("-password -createdBy -updatedBy")

      next()
    } catch (error) {
      console.error(error)
      res.status(401)
      throw new Error(ERROR_RESPONSE.FAILED_AUTH)
    }
  } else {
    req.user = {}
    next()
  }
})

const admin = asyncHandler(async (req, res, next) => {
  let token
  let error_message = ""
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1]
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.id).select("-password -createdBy -updatedBy")
      if (!user.isAdmin) {
        res.status(401)
        error_message = ERROR_RESPONSE.UNAUTHORIZED
        throw new Error(error_message)
      }
      req.user = user
      next()
    } catch (error) {
      console.error(error)
      res.status(401)
      throw new Error(error_message ? error_message : ERROR_RESPONSE.FAILED_AUTH)
    }
  }

  if (!token) {
    res.status(401)
    throw new Error(error_message ? error_message : ERROR_RESPONSE.FAILED_AUTH)
  }
})

export { protect, protectTemp, admin, semiProtect, apiLimiter }
