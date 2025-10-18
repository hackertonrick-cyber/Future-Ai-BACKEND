import express from "express"
import { startKycSession, getKycStatus, getMyKyc, getAllKyc, reviewKyc } from "../controllers/kycController.js"
import { admin, protect } from "../middleware/authMiddleware.js"
const router = express.Router()

// 🔒 User-facing routes
router
  .route("/")
  .post(protect, startKycSession) // start new KYC session
  .get(protect, getMyKyc) // fetch user's own KYC record(s)

router.route("/:id/status").get(protect, getKycStatus) // check current status by session ID

// 🔒 Admin-facing routes
router
  .route("/admin")
  .get(admin, getAllKyc) // list all KYC records
  .put(admin, reviewKyc) // approve/reject manually

export default router
