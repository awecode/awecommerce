import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendSesEmail } from '../server/utils/ses'

const sent = vi.hoisted(() => [] as { url: string; body: any }[])

vi.mock('aws4fetch', () => ({
  AwsClient: class {
    async fetch(url: string, init: { body: string }) {
      sent.push({ url, body: JSON.parse(init.body) })
      return new Response('{}', { status: 200 })
    }
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  ses: { secretKey: 'secret', region: 'us-east-1', accessKeyId: 'key', fromEmail: 'shop@example.com', endpoint: '' },
}))

beforeEach(() => {
  sent.length = 0
})

describe('sendSesEmail', () => {
  it('sends a simple mail without attachments', async () => {
    await sendSesEmail({ toEmails: ['a@example.com'], subject: 'Hello', message: 'Hi', html: '<p>Hi</p>' })

    expect(sent[0]!.url).toBe('https://email.us-east-1.amazonaws.com/v2/email/outbound-emails')
    expect(sent[0]!.body).toEqual({
      FromEmailAddress: 'shop@example.com',
      Destination: { ToAddresses: ['a@example.com'] },
      ReplyToAddresses: [],
      Content: { Simple: { Subject: { Data: 'Hello' }, Body: { Text: { Data: 'Hi' }, Html: { Data: '<p>Hi</p>' } } } },
    })
  })

  it('sends raw MIME with the text, the HTML and each attachment', async () => {
    await sendSesEmail({
      toEmails: ['a@example.com'],
      replyToEmails: ['help@example.com'],
      subject: 'Your invoice · ३',
      message: 'See attached',
      html: '<p>See attached</p>',
      attachments: [{ filename: 'invoice.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4') }],
    })

    const { Content, ...rest } = sent[0]!.body
    expect(rest).toEqual({
      FromEmailAddress: 'shop@example.com',
      Destination: { ToAddresses: ['a@example.com'] },
      ReplyToAddresses: ['help@example.com'],
    })
    const mime = Buffer.from(Content.Raw.Data, 'base64').toString('utf8')
    expect(mime).toContain('From: shop@example.com\r\nTo: a@example.com\r\nReply-To: help@example.com\r\n')
    // A subject that is not plain ASCII is encoded
    expect(mime).toContain(`Subject: =?UTF-8?B?${Buffer.from('Your invoice · ३').toString('base64')}?=`)
    expect(mime).toContain(`Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('See attached').toString('base64')}`)
    expect(mime).toContain(`Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('<p>See attached</p>').toString('base64')}`)
    expect(mime).toContain(
      `Content-Type: application/pdf; name="invoice.pdf"\r\nContent-Transfer-Encoding: base64\r\nContent-Disposition: attachment; filename="invoice.pdf"\r\n\r\n${Buffer.from('%PDF-1.4').toString('base64')}`,
    )
  })
})
