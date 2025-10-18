import { sendEmail } from "../middleware/s3.js"
import User from "../models/userModel.js"
import UserNotifications from "../models/userNotificationsModel.js"
import { privateNamespace } from "./socket.js"

const NOTIFICATION_RULES = {
  media_comment: { internal: true, email: false, socket: true },
  pet_purchase: { internal: true, email: true, socket: false },
  pet_named: { internal: true, email: true, socket: false },
  deposit_status: { internal: true, email: true, socket: false },
  welcome: { internal: true, email: true, socket: true },
  view_comment: { internal: true, email: false, socket: true },
  joined_heist: { internal: true, email: true, socket: false },
  heist_sponsored: { internal: true, email: true, socket: true },
  media_unlocked: { internal: true, email: true, socket: true },
  media_tipped: { internal: true, email: true, socket: true },
  media_liked: { internal: true, email: false, socket: true },
  kyc_update: { internal: true, email: true, socket: true },
  withdrawal_status: { internal: true, email: true, socket: true },
  message_received: { internal: false,  email: false,  socket: true },
  link_request: { internal: true, email: true, socket: true },
  tip_received: { internal: true, email: true, socket: true },
  profile_liked: { internal: true, email: false, socket: false },
  lpg_purchased: { internal: true, email: true, socket: false },
  password_reset: { internal: false, email: true, socket: false  },
  profile_viewed: { internal: true, email: false, socket: false },
  leaderboard_rank: {internal: true, email: false, socket: false  },
  report_resolution: { internal: true, email: true, socket: false },
  pet_sale_initiated: { internal: true, email: true, socket: false },
  pet_sold: { internal: true, email: true, socket: true },
  pet_purchase_success: { internal: true, email: true, socket: false },
  heist_eliminated: { internal: true, email: true, socket: false },
}

export const sendNotification = async ({ userId = [], type, subject, message, from = {}, actions = [], overrideNotify = null }) => {
  try {
    const notify = overrideNotify || NOTIFICATION_RULES[type] || {}
    if (!notify.internal && !notify.email && !notify.socket) return { success: true }

    // Normalize userId input to always be an array
    const userIds = [...new Set((Array.isArray(userId) ? userId : [userId]).filter(Boolean))]

    const emailJobs = []
    const socketJobs = []
    const mongoJobs = []

    // Define short-lived notification types
    const SHORT_LIVED_TYPES = [
      "media_comment",
      "pet_purchase",
      "welcome",
      "pet_named",
      "view_comment",
      "joined_heist",
      "heist_sponsored",
      "media_tipped",
      "media_unlocked",
      "media_reply",
      "link_request",
      "tip_received",
      "profile_viewed",
      "profile_liked",
      "lpg_purchased",
      "media_liked",
      "pet_sale_initiated",
      "pet_sold",
      "pet_purchase_success",
      "heist_eliminated"
    ]

    const TTL_DAYS = 14

    for (const uid of userIds) {
      // Optional: preload user if email is needed
      let userEmail = null
      if (notify.email) {
        const user = await User.findById(uid).select("email").lean()
        userEmail = user?.email
      }

      // Internal MongoDB Notification
      if (notify.internal) {
        const baseNotification = {
          userId: uid,
          subject,
          message,
          from,
          action_url: actions,
          action_required: actions.length > 0,
        }

        // Conditionally add expiresAt
        if (SHORT_LIVED_TYPES.includes(type)) {
          baseNotification.expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)
        }

        mongoJobs.push(UserNotifications.create(baseNotification))
      }

      // External Email Notification
      if (notify.email && userEmail) {
        const htmlBody = generateHTMLBody(type, subject, message, actions)
        const textBody = generateTextBody(message, actions)
        emailJobs.push(
          sendEmail({
            to: userEmail,
            subject,
            htmlBody,
            textBody,
          })
        )
      }

      // Socket Notification
      if (notify.socket) {
        socketJobs.push(
          privateNamespace.to(uid.toString()).emit("userNotification", {
            subject,
            message,
            from,
            actions,
            type,
            timestamp: new Date(),
          })
        )
      }
    }

    const results = await Promise.allSettled([...mongoJobs, ...emailJobs, ...socketJobs])
    const rejected = results.filter((r) => r.status === "rejected")
    return { success: rejected.length === 0, errors: rejected.map((r) => r.reason) }
  } catch (err) {
    console.error("NotificationService Error:", err)
    return { success: false, error: err }
  }
}

// ---------- Brand System ----------
const BRAND = {
  primary: "#137333", // brand-green-4
  accent: "#cea643", // brand-yellow-1
  text: "#1f2937", // gray-800
  subtext: "#6b7280", // gray-500
  bg: "#ffffff",
  panel: "#f8fafc", // gray-50
  border: "#e5e7eb", // gray-200
  radius: "12px",
  logo: process.env.LEPRECHAUN_IMAGE, // prefer a clean logo
  name: "PROJECT",
  siteUrl: process.env.FRONT_URL || "https://lepgold.com",
}

// Keep emojis empty for corporate tone (you can re-enable per type)
const TYPE_STYLES = {
  default: "",
  welcome: "🍀",
  joined_heist: "🔐",
  media_tipped: "💰",
  media_unlocked: "🎬",
  media_comment: "💬",
  view_comment: "👀",
  profile_liked: "❤️",
  profile_viewed: "🧭",
  lpg_purchased: "🪙",
  link_request: "🔗",
  tip_received: "🎁",
}

// ---------- Action → Route Map ----------
const ACTION_ROUTE_MAP = {
  ACCEPT_LINK_REQUEST: { path: "heistMembers" },
  CANCEL_LINK_REQUEST: { path: "heistMembers" },
  VIEW_COMMENT: { path: "notifications" },
  MEDIA_UNLOCKED: { path: "media" },
  MEDIA_TIPPED: { path: "notifications" },
  JOINED_HEIST: { path: "heistMembers" },
  WITHDRAWAL_STATUS: { path: "wallet/withdrawals" },
  KYC_UPDATE: { path: "settings/verification" },
  PASSWORD_RESET: { path: "auth/reset-password" },
  LPG_PURCHASED: { path: "wallet" },
  PROFILE_VIEWED: { path: "notifications" },
  PROFILE_LIKED: { path: "notifications" },
  REPORT_RESOLUTION: { path: "support/tickets" },
  ONBOARDING: { path: "about" },
  // default fallback handled below
}

// Small helper to build query strings safely
function toQuery(params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null)).toString()
  return qs ? `?${qs}` : ""
}

// Build hrefs for email CTAs from the allow-list
function buildActionHref(action) {
  // `action` can be a string or { type, text, params }
  console.log('action', action)
  const type = typeof action === "string" ? action : action.type
  console.log('type', type)
  const params = typeof action === "string" ? {} : action.params || {}

  const entry = ACTION_ROUTE_MAP[type] || { path: "" } // fallback to site root
  console.log('entry', entry)
  const query = toQuery({ action: type, ...params }) // carry intent + IDs
  const base = BRAND.siteUrl.replace(/\/+$/, "") // trim trailing slash

  return `${base}/${entry.path}${query}`
}

// ---------- Utilities ----------
const bulletproofButton = (href, label) => `
  <!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="${BRAND.accent}">
    <w:anchorlock/>
    <center style="color:#111827;font-family:Segoe UI, Roboto, Helvetica, Arial, sans-serif;font-size:15px;font-weight:700;">
      ${label}
    </center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <a href="${href}" style="
    display:inline-block;
    padding:12px 18px;
    background:${BRAND.accent};
    color:#111827;
    text-decoration:none;
    border-radius:8px;
    font-weight:700;
    font-size:15px;
    line-height:1;
  ">${label}</a>
  <!--<![endif]-->
`

function wrapParagraphs(message) {
  if (!message) return ""
  return String(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px 0;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("")
}

// ---------- HTML Body ----------
const generateHTMLBody = (type, subject, message, actions = []) => {
  const emoji = TYPE_STYLES[type] ?? TYPE_STYLES.default

  // Preheader for inbox preview (hidden in body)
  const preheader = String(message || "")
    .replace(/\s+/g, " ")
    .slice(0, 120)

  const actionBlock = actions.length
    ? `
      <tr>
        <td style="padding-top: 16px; text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr>
              ${actions
                .slice(0, 2)
                .map(
                  (a) => `
                  <td style="padding:6px 4px;">
                    ${bulletproofButton(buildActionHref(a), a.text)}
                  </td>
                `
                )
                .join("")}
            </tr>
            ${
              actions.length > 2
                ? `
              <tr>
                ${actions
                  .slice(2)
                  .map(
                    (a) => `
                  <td style="padding:6px 4px;">
                    ${bulletproofButton(buildActionHref(a), a.text)}
                  </td>
                `
                  )
                  .join("")}
              </tr>`
                : ""
            }
          </table>
        </td>
      </tr>
    `
    : ""

  return `
  <!doctype html>
  <html lang="en">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <meta name="x-apple-disable-message-reformatting" />
      <title>${subject}</title>
      <style>
        @media (prefers-color-scheme: dark) {
          body, .body-bg { background: #0b0f14 !important; }
          .panel { background: #0f172a !important; }
          .text { color: #e5e7eb !important; }
          .muted { color: #9ca3af !important; }
          .border { border-color: #1f2937 !important; }
        }
        @media screen and (max-width: 600px) {
          .container { width: 100% !important; }
          .px { padding-left: 20px !important; padding-right: 20px !important; }
          .center { text-align: center !important; }
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background:${BRAND.bg};">
      <!-- Preheader (hidden) -->
      <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
        ${preheader}
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="body-bg" style="background:${BRAND.bg};">
        <tr>
          <td align="center" style="padding: 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:100%;">
              
              <!-- Header -->
              <tr>
                <td class="px" style="padding: 12px 28px 0 28px; text-align:center;">
                  <a href="${BRAND.siteUrl}" target="_blank" rel="noopener" style="text-decoration:none;">
                    <img src="${BRAND.logo}" width="100" height="120" alt="${
    BRAND.name
  } logo" style="border-radius:50%; display:inline-block; border:1px solid ${BRAND.border};" />
                  </a>
                </td>
              </tr>
              <tr>
                <td class="px" style="padding: 16px 28px 0 28px; text-align:center;">
                  <h1 style="
                    margin:0;
                    font-family:-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                    font-size:24px;
                    line-height:1.25;
                    color:${BRAND.text};
                    font-weight:800;">
                    ${emoji ? `${emoji} ` : ""}${subject}
                  </h1>
                </td>
              </tr>

              <!-- Message Panel -->
              <tr>
                <td class="px" style="padding: 20px 28px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="panel border" style="
                    background:${BRAND.panel};
                    border:1px solid ${BRAND.border};
                    border-radius:${BRAND.radius};
                  ">
                    <tr>
                      <td style="padding: 24px;">
                        <div class="text" style="
                          font-family:-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                          font-size:16px;
                          line-height:1.6;
                          color:${BRAND.text};
                        ">
                          ${wrapParagraphs(message)}
                        </div>
                      </td>
                    </tr>
                    ${actionBlock}
                  </table>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td class="px" style="padding: 8px 28px 28px 28px;">
                  <p class="muted" style="
                    margin:0;
                    font-family:-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
                    font-size:12px;
                    color:${BRAND.subtext};
                    line-height:1.5;
                    text-align:center;">
                    © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `
}

// ---------- Plain Text Fallback ----------
const generateTextBody = (message, actions = []) => {
  const msg = (message || "").trim()
  const links = actions.map((a) => `• ${a.text}: ${process.env.FRONT_URL}/${a.url}`).join("\n")
  return [msg, links].filter(Boolean).join("\n\n")
}

export { generateHTMLBody, generateTextBody }