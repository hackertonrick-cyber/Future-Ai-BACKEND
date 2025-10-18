// validators/OrdertypesValidator.js
import Joi from 'joi'

export const createOrdertypesSchema = Joi.object({
  "orderType": Joi.string().required(),
  "name": Joi.string().required(),
  "API_ID": Joi.string().required(),
  "cost": Joi.number().min([0, 'Cost cannot be negative']).required(),
  "value": Joi.number().min([0, 'Cost cannot be negative']).required(),
  "description": Joi.string().optional(),
  "taxPrice": Joi.number().min([0, 'Tax price cannot be negative']).required(),
  "status": Joi.string().valid["active", "inactive"].optional(),
  "createdBy": Joi.string().optional(),
  "updatedBy": Joi.string().optional()
})

export const updateOrdertypesSchema = Joi.object({
  "orderType": Joi.string().optional(),
  "name": Joi.string().optional(),
  "API_ID": Joi.string().optional(),
  "cost": Joi.number().min([0, 'Cost cannot be negative']).optional(),
  "value": Joi.number().min([0, 'Cost cannot be negative']).optional(),
  "description": Joi.string().optional(),
  "taxPrice": Joi.number().min([0, 'Tax price cannot be negative']).optional(),
  "status": Joi.string().valid["active", "inactive"].optional(),
  "createdBy": Joi.string().optional(),
  "updatedBy": Joi.string().optional()
})
