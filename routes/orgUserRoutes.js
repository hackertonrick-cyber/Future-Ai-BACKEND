import express from "express"
const router = express.Router()
import {
  getOrgUserProfile,
  getPatientProfile,
  requestAccessFromOrganization,
  listAccessRequests,
  approveAccessRequest,
  disapproveAccessRequest,
  createOrganizationInvite,
   registerUser,
  registerSuperAdmin,
  registerOrgUser,
  registerOrganization,
  getUserNotifications,
  updateActionTaken,
  updateNotificationViewState,
  passwordResetInit,
  passwordReset,
} from "../controllers/userController.js"
import { protect, protectOrg, protectAdmin } from "../middleware/authMiddleware.js"

router.route("/user").post(registerUser)
router.route("/patient-profile").post(protect, getPatientProfile)

router.route("/admin/user").post( registerSuperAdmin)
router.route("/org").post(registerOrganization)
router.route("/notifications").get(protect, getUserNotifications)

router.route("/admin/generate-organization").post(protectAdmin, createOrganizationInvite)
router.route("/org/user-profile").post(protectOrg, getOrgUserProfile)
router.route("/org/new-user").post(protectOrg, registerOrgUser)

router.route("/org/profile-access/request").post(protectOrg, requestAccessFromOrganization)
router.route("/org/profile-access/approve").post(protectOrg, approveAccessRequest)
router.route("/org/profile-access/disapprove").post(protectOrg, disapproveAccessRequest)
router.route("/org/access-requests").post(protectOrg, listAccessRequests)

router.route("/password-reset-init").post(passwordResetInit)
router.route("/password-reset").post(passwordReset)

export default router