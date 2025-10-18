// validators/ImageValidator.js
import Joi from 'joi'

export const createImageSchema = Joi.object({
  "name": Joi.string().required(),
  "status": Joi.string().valid['active', 'inactive'].optional(),
  "createdBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  "updatedBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required()
})

export const updateImageSchema = Joi.object({
  "name": Joi.string().optional(),
  "status": Joi.string().valid['active', 'inactive'].optional(),
  "createdBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  "updatedBy": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional()
})
