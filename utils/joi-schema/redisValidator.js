// validators/RedisValidator.js
import Joi from 'joi'

export const createRedisSchema = Joi.object({
  "key": Joi.string().required(),
  "value": Joi.any().required(),
  "createdAt": Joi.date().optional()
})

export const updateRedisSchema = Joi.object({
  "key": Joi.string().optional(),
  "value": Joi.any().optional(),
  "createdAt": Joi.date().optional()
})
