// validators/UsernotificationsValidator.js
import Joi from 'joi'

export const createUsernotificationsSchema = Joi.object({
  "userId": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  "subject": Joi.string().optional(),
  "from": Joi.object({ "_id": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(), "userName": Joi.string().optional(), "avatar": Joi.string().optional() }),
  "message": Joi.string().optional(),
  "action_url": Joi.array().items(Joi.string()),
  "action_required": Joi.boolean().optional(),
  "action_taken": Joi.string().valid["none", "clicked", "dismissed", "completed"].optional(),
  "status": Joi.string().valid["viewed", "not_viewed"].optional(),
  "expiresAt": Joi.date().optional()
})

export const updateUsernotificationsSchema = Joi.object({
  "userId": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  "subject": Joi.string().optional(),
  "from": Joi.object({ "_id": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(), "userName": Joi.string().optional(), "avatar": Joi.string().optional() }),
  "message": Joi.string().optional(),
  "action_url": Joi.array().items(Joi.string()),
  "action_required": Joi.boolean().optional(),
  "action_taken": Joi.string().valid["none", "clicked", "dismissed", "completed"].optional(),
  "status": Joi.string().valid["viewed", "not_viewed"].optional(),
  "expiresAt": Joi.date().optional()
})
