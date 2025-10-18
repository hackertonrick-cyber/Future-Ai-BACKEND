// validators/SpendlogValidator.js
import Joi from 'joi'

export const createSpendlogSchema = Joi.object({
  "fromUser": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  "toUser": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  "amountSpent": Joi.number().required(),
  "platformCut": Joi.number().required(),
  "creatorPayout": Joi.number().required(),
  "type": Joi.string().valid[
        "media_tip",
        "media_unlock",
        "gift",
        "heist_entry",
        "heist_cut",
        "riddle_attempt",
        "message_media_tip",
        "message_cap",
        "media_cap",
        "withdraw_fee",
        "system_fee",
        "custom"
      ].required(),
  "description": Joi.string().optional(),
  "details": Joi.any().optional()
})

export const updateSpendlogSchema = Joi.object({
  "fromUser": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  "toUser": Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
  "amountSpent": Joi.number().optional(),
  "platformCut": Joi.number().optional(),
  "creatorPayout": Joi.number().optional(),
  "type": Joi.string().valid[
        "media_tip",
        "media_unlock",
        "gift",
        "heist_entry",
        "heist_cut",
        "riddle_attempt",
        "message_media_tip",
        "message_cap",
        "media_cap",
        "withdraw_fee",
        "system_fee",
        "custom"
      ].optional(),
  "description": Joi.string().optional(),
  "details": Joi.any().optional()
})
