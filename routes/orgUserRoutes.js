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
  getOrganizationsList,
} from "../controllers/userController.js"
import { protect, protectOrg, protectAdmin } from "../middleware/authMiddleware.js"
import {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  cancelAppointment,
  rescheduleAppointment,
  deleteAppointment,
} from "../controllers/appointmentController.js"

router.route("/patient").post(registerUser)
router.route("/patient-profile").get(protect, getPatientProfile)

router.route("/admin/user").post(protectAdmin, registerSuperAdmin)
router.route("/org/register").post(registerOrganization)
router.route("/notifications").get(protect, getUserNotifications)

router.route("/admin/generate-organization").post(protectAdmin, createOrganizationInvite)
router.route("/org/user-profile").get(protectOrg, getOrgUserProfile)
router.route("/org/new-user").post(protectOrg, registerOrgUser)
router.route("/organizations").get(protect, getOrganizationsList)

router.route("/org/appointment").post(protectOrg, createAppointment)
router.get("/org/appointment", protectOrg, getAppointments)
router.get("/org/appointment/:id", protectOrg, getAppointmentById)
router.put("/org/appointment/:id", protectOrg, updateAppointment)
router.put("/org/appointment/:id/cancel", protectOrg, cancelAppointment)
router.put("/org/appointment/:id/reschedule", protectOrg, rescheduleAppointment)
router.delete("/org/appointment/:id", protectOrg, deleteAppointment)

router.route("/org/profile-access/request").post(protectOrg, requestAccessFromOrganization)
router.route("/org/profile-access/approve").post(protectOrg, approveAccessRequest)
router.route("/org/profile-access/disapprove").post(protectOrg, disapproveAccessRequest)
router.route("/org/access-requests").get(protectOrg, listAccessRequests)

router.route("/password-reset-init").post(passwordResetInit)
router.route("/password-reset").post(passwordReset)

export default router
