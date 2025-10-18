// validators/CounterValidator.js
import Joi from 'joi'

export const createCounterSchema = Joi.object({
  "key": Joi.string().required(),
  "count": Joi.number().optional()
})

export const updateCounterSchema = Joi.object({
  "key": Joi.string().optional(),
  "count": Joi.number().optional()
})
