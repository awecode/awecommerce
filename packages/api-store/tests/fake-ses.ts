import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll } from 'vitest'

// A stand-in for the SES v2 API: records the mails the server sends through
// it. A recipient containing `ses-fail` is refused (400), as SES refuses a
// message it will not send.
export type SentMail = { to: string[]; subject: string; html: string; text: string }

export const startFakeSes = async () => {
  const mails: SentMail[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => {
      const params = JSON.parse(body)
      const mail: SentMail = {
        to: params.Destination.ToAddresses,
        subject: params.Content.Simple.Subject.Data,
        html: params.Content.Simple.Body.Html?.Data ?? '',
        text: params.Content.Simple.Body.Text?.Data ?? '',
      }
      if (mail.to.some((to) => to.includes('ses-fail'))) {
        response.writeHead(400).end('{"message":"Email address is not verified."}')
        return
      }
      mails.push(mail)
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"MessageId":"fake"}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const { port } = server.address() as AddressInfo

  // The built server sends there, signed with these made-up keys
  process.env.NUXT_SES_ENDPOINT = `http://127.0.0.1:${port}/v2/email/outbound-emails`
  process.env.NUXT_SES_ACCESS_KEY_ID = 'test-access-key'
  process.env.NUXT_SES_SECRET_KEY = 'test-secret-key'
  process.env.NUXT_SES_FROM_EMAIL = 'shop@example.com'
  // Order emails link to the storefront here
  process.env.NUXT_PUBLIC_SITE_URL = 'http://storefront.test'

  return {
    // The mails sent to this address, oldest first
    to: (email: string) => mails.filter((mail) => mail.to.includes(email)),
  }
}
