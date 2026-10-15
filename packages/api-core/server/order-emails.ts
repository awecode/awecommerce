// What the customer is told when their order is placed, shipped or cancelled:
// the subject, an HTML message in the magic-link mail's style, and its plain
// text. Sent by sendOrderEmail (server/utils/orderEmails.ts).

import type { FulfillmentNote } from './utils/fulfillment'

export type OrderEmailKind = 'placed' | 'shipped' | 'cancelled'

export type OrderEmailOrder = {
  id: number
  total: string
  cancellationReason?: string | null
  lines: {
    id: number
    productName: string
    options: { name: string; value: string }[]
    quantity: number
    price: string | null
    discount: string
    // The line's fulfilment note, in the placed email
    note?: FulfillmentNote | null
  }[]
}

export type OrderEmailStore = { name: string; currency: string; locale: string }

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Trebuchet MS', Roboto, Helvetica, Arial, sans-serif`

// The magic-link mail's frame: white on black, centred, one button
const frame = (body: string) => `<!doctype html>
<html>
  <body>
    <div style="background-color: #000000; color: #ffffff; font-family: ${font}; font-size: 16px; line-height: 1.5; margin: 0; padding: 32px 0; width: 100%;">
      <table style="margin: 0 auto; max-width: 600px; background-color: #000000;" role="presentation" border="0" width="100%" cellspacing="0" cellpadding="0" align="center">
        <tbody><tr><td style="padding: 0 16px;">
${body}
        </td></tr></tbody>
      </table>
    </div>
  </body>
</html>`

const paragraph = (html: string, style = 'color: #ffffff; font-size: 16px;') =>
  `          <div style="${style} text-align: center; padding: 16px 0;">${html}</div>`

const button = (link: string, label: string) =>
  `          <div style="text-align: center; padding: 8px 0;"><a href="${escape(link)}" style="text-decoration: none; display: inline-block; background: #ffffff; color: #000000; padding: 12px 20px; font-size: 16px;" target="_blank"><strong>${escape(label)}</strong></a></div>`

export const orderEmailContent = (
  kind: OrderEmailKind,
  order: OrderEmailOrder,
  store: OrderEmailStore,
  link: string,
): { subject: string; html: string; text: string } => {
  const storeName = store.name || 'our store'
  const money = (value: number | string) =>
    new Intl.NumberFormat(store.locale || 'en-US', { style: 'currency', currency: store.currency || 'USD' }).format(Number(value))
  const number = `#${order.id}`

  if (kind === 'placed') {
    const lines = order.lines.map((line) => ({
      name: line.productName,
      options: line.options.map((o) => `${o.name}: ${o.value}`).join(', '),
      quantity: line.quantity,
      amount: money((Number(line.price ?? 0) - Number(line.discount)) * line.quantity),
      note: line.note,
    }))
    const noteHtml = (note: FulfillmentNote) =>
      `<br><span style="font-size: 14px;"><strong>${escape(note.title)}</strong><br><span style="color: #bbbbbb;">${escape(note.text)}</span>${note.link ? `<br><a href="${escape(note.link.url)}" style="color: #ffffff;" target="_blank">${escape(note.link.label)}</a>` : ''}</span>`
    const noteText = (note: FulfillmentNote) =>
      [`  ${note.title}: ${note.text}`, ...(note.link ? [`  ${note.link.label}: ${note.link.url}`] : [])]
    const rows = lines
      .map((line) => `            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #333333;">${escape(line.name)}${line.options ? `<br><span style="color: #868686; font-size: 14px;">${escape(line.options)}</span>` : ''}${line.note ? noteHtml(line.note) : ''}</td>
              <td style="padding: 8px 12px; border-bottom: 1px solid #333333; text-align: center;">× ${line.quantity}</td>
              <td style="padding: 8px 0; border-bottom: 1px solid #333333; text-align: right; white-space: nowrap;">${escape(line.amount)}</td>
            </tr>`)
      .join('\n')
    return {
      subject: `Your ${storeName} order ${number}`,
      html: frame([
        paragraph(`Thank you for your order. Order <strong>${number}</strong> is placed.`),
        `          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="color: #ffffff; font-size: 15px;">
${rows}
            <tr>
              <td colspan="2" style="padding: 12px 0;"><strong>Total</strong></td>
              <td style="padding: 12px 0; text-align: right; white-space: nowrap;"><strong>${escape(money(order.total))}</strong></td>
            </tr>
          </table>`,
        button(link, 'View your order'),
        paragraph(`Sent by ${escape(storeName)} about your order ${number}.`, 'color: #868686; font-size: 12px;'),
      ].join('\n')),
      text: [
        `Thank you for your order. Order ${number} is placed.`,
        '',
        ...lines.flatMap((line) => [
          `${line.name}${line.options ? ` (${line.options})` : ''} × ${line.quantity}: ${line.amount}`,
          ...(line.note ? noteText(line.note) : []),
        ]),
        `Total: ${money(order.total)}`,
        '',
        `View your order: ${link}`,
        '',
        `Sent by ${storeName} about your order ${number}.`,
      ].join('\n'),
    }
  }

  if (kind === 'shipped') {
    return {
      subject: `Your ${storeName} order ${number} has shipped`,
      html: frame([
        paragraph(`Good news: order <strong>${number}</strong> has shipped and is on its way.`),
        button(link, 'View your order'),
        paragraph(`Sent by ${escape(storeName)} about your order ${number}.`, 'color: #868686; font-size: 12px;'),
      ].join('\n')),
      text: [
        `Good news: order ${number} has shipped and is on its way.`,
        '',
        `View your order: ${link}`,
        '',
        `Sent by ${storeName} about your order ${number}.`,
      ].join('\n'),
    }
  }

  const reason = order.cancellationReason?.trim()
  return {
    subject: `Your ${storeName} order ${number} was cancelled`,
    html: frame([
      paragraph(`Order <strong>${number}</strong> was cancelled.`),
      reason ? paragraph(`Reason: ${escape(reason)}`) : '',
      button(link, 'View your order'),
      paragraph(`Sent by ${escape(storeName)} about your order ${number}.`, 'color: #868686; font-size: 12px;'),
    ].filter(Boolean).join('\n')),
    text: [
      `Order ${number} was cancelled.`,
      ...(reason ? [`Reason: ${reason}`] : []),
      '',
      `View your order: ${link}`,
      '',
      `Sent by ${storeName} about your order ${number}.`,
    ].join('\n'),
  }
}
