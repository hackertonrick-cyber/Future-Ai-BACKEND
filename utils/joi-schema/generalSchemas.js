import Joi from 'joi'


// 🔹 General reusable validators
const stringRequired = Joi.string().trim().required()
const stringOptional = Joi.string().trim().optional()
const email = Joi.string().trim().lowercase().email()
const password = Joi.string().min(8).max(128)
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/)
const geoPoint = Joi.object({
  type: Joi.string().valid('Point').default('Point'),
  // [lng, lat]
  coordinates: Joi.array()
    .length(2)
    .items(
      Joi.number().min(-180).max(180), // longitude
      Joi.number().min(-90).max(90)    // latitude
    )
    .default([0, 0]),
})
const booleanRequired = Joi.boolean().required()
const booleanOptional = Joi.boolean().optional()
const date = Joi.date()
const isoDate = Joi.date().iso()
const url = Joi.string().uri({ scheme: [/https?/] })

// 🔹 Export everything together
export const JoiValidators = {
  stringRequired,
  stringOptional,
  email,
  password,
  objectId,
  geoPoint,
  booleanRequired,
  booleanOptional,
  date,
  isoDate,
  url,
}