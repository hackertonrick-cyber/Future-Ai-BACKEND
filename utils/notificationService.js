import { sendEmail } from "../middleware/s3.js"
import Notification from "../models/notificationModel.js"
import { privateNamespace } from "./socket.js"
import { generateHTMLBody, generateTextBody } from "./notificationTemplates.js"
import OrgUser from "../models/orgUserModel.js"

const NOTIFICATION_RULES = {
  access_request_org: { internal: true, email: true, socket: true },
  access_approved: { internal: true, email: true, socket: true },
  access_denied: { internal: true, email: true, socket: true },
  access_revoked: { internal: true, email: true, socket: true },
  appointment: { internal: true, email: true, socket: true },
  vital_update: { internal: true, email: false, socket: true },
  system_alert: { internal: true, email: true, socket: true },
  welcome: { internal: true, email: true, socket: false },
}

/**
 * Universal notification service.
 * Supports Patients, OrgUsers, and Organizations.
 */
export const sendNotification = async ({
  recipients = [], // array or single objectId
  type = "system_alert",
  subject,
  message,
  from = {}, // {_id, userName, avatar, model}
  actions = [],
  relatedEntity = null,
  orgContext = {}, // { companyCode, branchCode }
  overrideNotify = null,
}) => {
  try {
    const notify = overrideNotify || NOTIFICATION_RULES[type] || {}
    if (!notify.internal && !notify.email && !notify.socket) return { success: true, skipped: true }

    // Normalize recipients array
    const targetIds = Array.isArray(recipients) ? recipients : [recipients]

    const mongoJobs = []
    const emailJobs = []
    const socketJobs = []

    for (const targetId of targetIds) {
      let recipientDoc = null
      let model = null
      let recipientEmail = null

      // 🔍 Auto-detect recipient type
      recipientDoc = await OrgUser.findById(targetId).select("username role companyCode branchCode").lean()
      if (recipientDoc) {
        model = "OrgUser"
        recipientEmail = recipientDoc.username.includes("@") ? recipientDoc.username : null
      } else {
        recipientDoc = await Patient.findById(targetId).select("email firstName lastName").lean()
        if (recipientDoc) {
          model = "Patient"
          recipientEmail = recipientDoc.email
        }
      }

      if (!recipientDoc) continue // skip invalid

      // 🧱 Build base notification
      const notifData = {
        recipient: {
          _id: targetId,
          model,
          companyCode: recipientDoc.companyCode,
          branchCode: recipientDoc.branchCode,
        },
        sender: {
          _id: from._id,
          userName: from.userName || "System",
          avatar: from.avatar || null,
          model: from.model || "System",
        },
        subject,
        message,
        type,
        actions,
        orgContext: {
          companyCode: orgContext.companyCode || recipientDoc.companyCode,
          branchCode: orgContext.branchCode || recipientDoc.branchCode,
          relatedEntity,
          relatedEntityModel: relatedEntity ? typeToModel(type) : null,
        },
      }

      // ✅ Database persistence
      if (notify.internal) {
        mongoJobs.push(Notification.create(notifData))
      }

      // ✅ Email notifications
      if (notify.email && recipientEmail) {
        const htmlBody = generateHTMLBody(type, subject, message, actions)
        const textBody = generateTextBody(message, actions)
        emailJobs.push(sendEmail({ to: recipientEmail, subject, htmlBody, textBody }))
      }

      // ✅ Socket notification
      if (notify.socket) {
        const channelPrefix = model === "OrgUser" ? "org" : model === "Patient" ? "patient" : "system"
        socketJobs.push(
          privateNamespace.to(`${channelPrefix}:${targetId.toString()}`).emit("userNotification", {
            subject,
            message,
            type,
            actions,
            from,
            timestamp: new Date(),
          })
        )
      }
    }

    const results = await Promise.allSettled([...mongoJobs, ...emailJobs, ...socketJobs])
    const failed = results.filter((r) => r.status === "rejected")

    return { success: failed.length === 0, failed: failed.map((r) => r.reason) }
  } catch (error) {
    console.error("sendNotification Error:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Maps notification type → related model (for audit context)
 */
function typeToModel(type) {
  const map = {
    access_request_org: "AccessRequestOrg",
    access_approved: "AccessRequest",
    appointment: "Appointment",
    vital_update: "PatientVitals",
  }
  return map[type] || null
}
