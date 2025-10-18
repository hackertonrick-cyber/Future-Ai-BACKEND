import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

// Optional: brand-friendly display name
const FROM_EMAIL = process.env.NOTIFICATION_EMAIL || 'no-reply@notifications.com'
const SOURCE     = process.env.NOTIFICATION_EMAIL 

export const sendEmail = async ({ to, subject, htmlBody, textBody }) => {
  const params = {
    Destination: { ToAddresses: Array.isArray(to) ? to : [to] },
    Message: {
      Subject: { Charset: 'UTF-8', Data: subject },
      Body: {
        Html: { Charset: 'UTF-8', Data: htmlBody },
        Text: { Charset: 'UTF-8', Data: textBody || stripHtml(htmlBody).slice(0, 5000) },
      },
    },
    Source: SOURCE,
    ReplyToAddresses: [FROM_EMAIL],
    // Optional extras:
    // ConfigurationSetName: process.env.SES_CONFIG_SET,
    // ReturnPath: process.env.BOUNCE_EMAIL, // must be verified
  }

  try {
    const result = await ses.send(new SendEmailCommand(params))
    console.log('✅ Email sent:', result?.MessageId)
    return result
  } catch (error) {
    console.warn('⚠️ Email send failed (non-blocking):', error?.message || error)
    // Consider rethrowing if you want upstream retry/queue behavior:
    // throw error
    return null
  }
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
