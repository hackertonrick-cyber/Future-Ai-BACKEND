import express from "express"
const router = express.Router()
import {
  registerUser,
  getUserProfile,
  updateUserProfile,
  getUserTempData,
  verifyOtp,
  sendVerificationOtp,
  getSignedURL,
  submitKyc,
  reviewKyc,
  getAllKyc,
  getUserNotifications,
  updateProfileImage,
  passwordResetInit,
  passwordReset,
} from "../controllers/userController.js"
import { admin, protect, protectTemp } from "../middleware/authMiddleware.js"
import { profileImageUpload } from "../middleware/multerMiddleware.js"
import { validateRequest } from "../middleware/validateRequest.js"
import { createUserSchema } from "../utils/joi-schema/userValidator.js"

router.route("/").post(validateRequest(createUserSchema), registerUser).get(protect, getUserProfile).put(protect, updateUserProfile)
router.route("/notifications").get(protect, getUserNotifications)
router.route("/get-temp-user-data").get(protectTemp("sign_in"), getUserTempData)
router.route("/get-signup-data").get(protectTemp("signup"), getUserTempData)

router.route("/profile_image").post(protect, profileImageUpload.single('image'), updateProfileImage)
router.route("/media/signed-url").get(protect, getSignedURL)
// router.route("/finalize-profile-image").post(protect, finalizedprofileImageUpload)

router.route("/send-verification-otp").post(protect, sendVerificationOtp)
router.route("/verify-otp").post(protect, verifyOtp)
router.route("/kyc").post(protect, submitKyc)
router.route("/admin/kyc").get(admin, getAllKyc).put(admin, reviewKyc)

router.route("/password-reset-init").post(passwordResetInit)
router.route("/password-reset").post(passwordReset)

export default router