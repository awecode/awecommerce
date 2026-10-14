// "42.50000000" from the database is "42.5"
export const trimDecimal = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

// Plain text from the rich text editor's HTML, for descriptions in meta tags
export const htmlToText = (html: string | null | undefined) =>
  (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
