import Joi from "joi"
import { JoiValidators } from "./generalSchemas.js"

const MIN_AGE_YEARS = 16
const cutoff = new Date()
cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS)

export const createUserSchema = Joi.object({
  userName: Joi.string().min(3).max(30).trim().required(),
  firstName: Joi.string().min(3).max(30).trim().required(),
  lastName: Joi.string().min(3).max(30).trim().required(),
  gender: Joi.string().min(3).max(10).trim().optional(),
  dob: Joi.date().max(cutoff).required().messages({ "date.max": "User must be at least 16 years old." }),
  email: Joi.string().email().max(50).required(),
  country: JoiValidators.objectId.required(),
  termsCondition: Joi.boolean().valid(true).required().messages({ "any.only": "You must accept the terms and conditions." }),
  newsLetters: Joi.boolean().default(false),
  password: Joi.string().min(8).max(150),
  googleId: Joi.string(),
  location: Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required(),
  }),
}).or("googleId", "password")

export const profileImageSchema = Joi.object({
  image: Joi.any().required(), // multer handles it, but you may still want meta checks
})

export const otpSchema = Joi.object({
  otp: Joi.string().length(6).required(),
})

export const passwordResetSchema = Joi.object({
  email: Joi.string().email().required(),
})

export const passwordResetFinalSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string().min(8).required(),
})
