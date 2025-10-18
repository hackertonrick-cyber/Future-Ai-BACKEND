// middleware/validateRequest.js
import Joi from 'joi'

/**
 * Validates req.body / req.query / req.params / req.headers with Joi.
 *
 * Usage:
 *  // 1) Single schema (defaults to body)
 *  router.post('/users', validateRequest(createUserSchema), handler)
 *
 *  // 2) Per-part schemas
 *  router.get(
 *    '/items/:id',
 *    validateRequest({ params: paramsSchema, query: querySchema }),
 *    handler
 *  )
 *
 * Options:
 *  - abortEarly: false  -> collect all errors
 *  - stripUnknown: true -> remove extra keys
 *  - convert: true      -> coerce types (e.g., "42" -> 42)
 */
export const validateRequest = (schemas, options = {}) => {
  // Accept either a single Joi schema (applies to body) or an object { body, query, params, headers }
  const perPart = Joi.isSchema(schemas)
    ? { body: schemas }
    : (schemas || {})

  const defaults = {
    abortEarly: false,
    stripUnknown: true,
    convert: true,
  }

  return (req, res, next) => {
    try {
      for (const part of ['body', 'query', 'params', 'headers']) {
        const schema = perPart[part]
        if (!schema) continue

        const { value, error } = schema.validate(
          req[part],
          { ...defaults, ...(options[part] || options) }
        )

        if (error) {
          return res.status(400).json({
            message: error.details[0]?.message || 'Validation failed',
            details: error.details.map(d => ({
              message: d.message,
              path: d.path,
              type: d.type,
              context: d.context,
            })),
            part,
          })
        }

        // Overwrite with sanitized/coerced values
        req[part] = value
      }

      next()
    } catch (err) {
      next(err)
    }
  }
}
