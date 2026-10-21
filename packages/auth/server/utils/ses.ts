import { AwsClient } from 'aws4fetch'

export type EmailAttachment = {
  filename: string
  contentType: string
  content: Buffer
}

export interface SendEmailParams {
  toEmails: string[]
  replyToEmails?: string[]
  subject: string
  message?: string
  html?: string
  attachments?: EmailAttachment[]
}

const encodeSubject = (subject: string) => {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
}

const buildRawMime = ({
  fromEmail,
  toEmails,
  replyToEmails,
  subject,
  message,
  html,
  attachments,
}: {
  fromEmail: string
  toEmails: string[]
  replyToEmails: string[]
  subject: string
  message?: string
  html?: string
  attachments: EmailAttachment[]
}) => {
  const mixed = `mixed_${Date.now().toString(36)}`
  const alt = `alt_${Date.now().toString(36)}`
  const lines = [
    `From: ${fromEmail}`,
    `To: ${toEmails.join(', ')}`,
    ...(replyToEmails.length ? [`Reply-To: ${replyToEmails.join(', ')}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
  ]
  if (message) {
    lines.push(
      `--${alt}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(message, 'utf8').toString('base64'),
      '',
    )
  }
  if (html) {
    lines.push(
      `--${alt}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(html, 'utf8').toString('base64'),
      '',
    )
  }
  lines.push(`--${alt}--`, '')
  for (const file of attachments) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${file.contentType}; name="${file.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${file.filename}"`,
      '',
      file.content.toString('base64'),
      '',
    )
  }
  lines.push(`--${mixed}--`, '')
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64')
}

export async function sendSesEmail({
  toEmails,
  replyToEmails = [],
  subject,
  message,
  html,
  attachments = [],
}: SendEmailParams): Promise<void> {
  const config = useRuntimeConfig()

  const sesEndpoint = config.ses.endpoint
    || `https://email.${config.ses.region}.amazonaws.com/v2/email/outbound-emails`
  const fromEmail = config.ses.fromEmail

  if (!fromEmail) {
    throw new Error('Please configure NUXT_SES_FROM_EMAIL.')
  }

  if (!message && !html) {
    throw new Error('Please provide either message or html.')
  }

  const aws = new AwsClient({
    accessKeyId: config.ses.accessKeyId,
    secretAccessKey: config.ses.secretKey,
    // A failing SES answers within about a second (aws4fetch's default is 10
    // retries, ~25s), as mail is sent before the request answers
    retries: 2,
  })

  const emailParams = attachments.length
    ? {
        FromEmailAddress: fromEmail,
        Destination: { ToAddresses: toEmails },
        ...(replyToEmails.length ? { ReplyToAddresses: replyToEmails } : {}),
        Content: {
          Raw: {
            Data: buildRawMime({ fromEmail, toEmails, replyToEmails, subject, message, html, attachments }),
          },
        },
      }
    : {
        FromEmailAddress: fromEmail,
        Destination: { ToAddresses: toEmails },
        ReplyToAddresses: replyToEmails,
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              ...(message ? { Text: { Data: message } } : {}),
              ...(html ? { Html: { Data: html } } : {}),
            },
          },
        },
      }

  const response = await aws.fetch(sesEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailParams),
  })
  if (response.status !== 200) {
    throw new Error('Failed to send email')
  }
}
