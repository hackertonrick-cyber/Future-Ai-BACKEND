import express from "express"
import { handleStripeWebhook } from "../controllers/orderController.js"
import { kycWebhook } from "../controllers/kycController.js"

const router = express.Router()

router.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
)
router.post("/didit", express.raw({ type: "*/*" }), kycWebhook)
export default router
