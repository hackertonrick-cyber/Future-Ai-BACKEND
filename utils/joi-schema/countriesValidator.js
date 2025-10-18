// validators/CountriesValidator.js
import Joi from 'joi'

export const createCountriesSchema = Joi.object({
  "countryId": Joi.string().optional(),
  "description": Joi.string().optional(),
  "createdBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
})

export const updateCountriesSchema = Joi.object({
  "countryId": Joi.string().optional(),
  "description": Joi.string().optional(),
  "createdBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
})
