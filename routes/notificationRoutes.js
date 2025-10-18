import express from "express"
const router = express.Router()
import { updateActionTaken, updateNotificationViewState } from "../controllers/userController.js"
import { protect } from "../middleware/authMiddleware.js"

router.route("/viewed").put(protect, updateNotificationViewState)
router.route("/action_taken").put(protect, updateActionTaken)

export default router
