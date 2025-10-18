/**
 * Notification Email Templates
 * For: OrgUser, Patient, SuperAdmin
 * Brand: Professional, clean, healthcare-grade design
 */

const BRAND = {
  name: process.env.PROJECT_NAME || "HealthCom",
  siteUrl: process.env.FRONT_URL || "https://careconnect.health",
  primary: "#137333", // brand green
  accent: "#cea643", // gold accent
  bg: "#ffffff",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  radius: "10px",
}

/* ----------------------------------------------------------
 *  HTML GENERATOR
 * ---------------------------------------------------------- */

/**
 * Generates a rich, responsive HTML email body
 * @param {String} type - Notification type
 * @param {String} subject - Email subject line
 * @param {String} message - Main message
 * @param {Array} actions - Optional CTA buttons [{text, url}]
 */
export const generateHTMLBody = (type, subject, message, actions = []) => {
  const emoji = TYPE_ICON[type] || ""
  const preheader = String(message || "").replace(/\s+/g, " ").slice(0, 140)

  const actionButtons = actions.length
    ? `
      <tr>
        <td align="center" style="padding: 20px 0;">
          ${actions
            .map(
              (a) => `
            <a href="${a.url}" style="
              display:inline-block;
              padding:12px 22px;
              margin:4px;
              background:${BRAND.accent};
              color:#111827;
              text-decoration:none;
              border-radius:${BRAND.radius};
              font-weight:600;
              font-size:15px;
              line-height:1;
            ">
              ${a.text}
            </a>`
            )
            .join("")}
        </td>
      </tr>`
    : ""

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <meta name="x-apple-disable-message-reformatting">
      <title>${subject}</title>
      <style>
        @media (prefers-color-scheme: dark) {
          body { background:#0b0f14 !important; color:#e5e7eb !important; }
          .panel { background:#0f172a !important; border-color:#1f2937 !important; }
          a.button { background:${BRAND.accent} !important; color:#111827 !important; }
        }
        @media screen and (max-width:600px) {
          .container { width:100% !important; }
        }
      </style>
    </head>
    <body style="margin:0; padding:0; background:${BRAND.bg}; color:${BRAND.text}; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent;">
        ${preheader}
      </div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding:24px;">
            <table role="presentation" class="container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:100%; border-collapse:collapse;">

              <!-- Logo -->
              <tr>
                <td align="center" style="padding-bottom:16px;">
                  <img src="${BRAND.logo}" alt="${BRAND.name}" width="100" height="100" style="border-radius:50%; border:1px solid ${BRAND.border};"/>
                </td>
              </tr>

              <!-- Subject -->
              <tr>
                <td align="center" style="padding-bottom:12px;">
                  <h1 style="font-size:22px; line-height:1.4; margin:0; font-weight:700;">
                    ${emoji} ${subject}
                  </h1>
                </td>
              </tr>

              <!-- Message -->
              <tr>
                <td style="padding:20px 28px; background:${BRAND.bg};">
                  <div class="panel" style="
                    background:${BRAND.bg};
                    border:1px solid ${BRAND.border};
                    border-radius:${BRAND.radius};
                    padding:20px;
                    font-size:15px;
                    line-height:1.6;
                    color:${BRAND.text};
                  ">
                    ${wrapParagraphs(message)}
                  </div>
                </td>
              </tr>

              ${actionButtons}

              <!-- Footer -->
              <tr>
                <td align="center" style="padding:20px 0 0 0; font-size:12px; color:${BRAND.muted};">
                  © ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
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

/* ----------------------------------------------------------
 *  TEXT GENERATOR
 * ---------------------------------------------------------- */

/**
 * Generates plain-text fallback body for email clients
 */
export const generateTextBody = (message, actions = []) => {
  const msg = (message || "").trim()
  const links = actions.map((a) => `• ${a.text}: ${a.url}`).join("\n")
  return [msg, links].filter(Boolean).join("\n\n")
}

/* ----------------------------------------------------------
 *  HELPERS
 * ---------------------------------------------------------- */

const TYPE_ICON = {
  access_request: "📥",
  access_approved: "✅",
  access_denied: "❌",
  appointment: "📅",
  vital_update: "💓",
  system_alert: "⚠️",
  welcome: "👋",
}

function wrapParagraphs(message = "") {
  return String(message)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")
}
