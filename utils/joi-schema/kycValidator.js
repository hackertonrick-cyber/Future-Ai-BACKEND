// validators/KycValidator.js
import Joi from 'joi'

export const createKycSchema = Joi.object({
  "id": Joi.string().required(),
  "type": Joi.string().required(),
  "occurredAt": Joi.date().required(),
  "status": Joi.string().required()
})

export const updateKycSchema = Joi.object({
  "id": Joi.string().optional(),
  "type": Joi.string().optional(),
  "occurredAt": Joi.date().optional(),
  "status": Joi.string().optional()
})
