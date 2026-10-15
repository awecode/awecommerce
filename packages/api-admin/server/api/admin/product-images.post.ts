// Uploads a product image (multipart form: `file` and the product's `slug`)
// and answers with its public URL, which the product's images then use. The
// key is <slug>.<ext> (<slug>-1.<ext> and so on when taken), the extension
// from what the file really is: JPEG, PNG or WebP, up to 8 MiB.
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024

// The file's real type, from its first bytes; the declared type is not trusted
const imageType = (bytes: Uint8Array): { extension: string; contentType: string } | null => {
  const starts = (signature: number[], at = 0) => signature.every((byte, i) => bytes[at + i] === byte)
  if (starts([0xFF, 0xD8, 0xFF])) return { extension: 'jpg', contentType: 'image/jpeg' }
  if (starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return { extension: 'png', contentType: 'image/png' }
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { extension: 'webp', contentType: 'image/webp' }
  return null
}

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

export default defineEventHandler(async (event) => {
  // Refused before reading, when the request says it is too big
  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_PRODUCT_IMAGE_BYTES + 64 * 1024) {
    throw fail(413, 'Payload Too Large', 'Images can be up to 8 MB.')
  }
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((part) => part.name === 'file' && part.filename !== undefined)
  const slug = parts.find((part) => part.name === 'slug')?.data.toString('utf8').trim() ?? ''
  if (!file) {
    throw fail(400, 'Bad Request', 'Send the image as the file field.')
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw fail(422, 'Unprocessable Entity', 'The slug can only have lowercase letters, numbers and hyphens.')
  }
  if (file.data.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw fail(413, 'Payload Too Large', 'Images can be up to 8 MB.')
  }
  const type = imageType(file.data)
  if (!type) {
    throw fail(415, 'Unsupported Media Type', 'Images must be JPEG, PNG or WebP.')
  }
  try {
    return await uploadToObjectStorage(event, new Uint8Array(file.data), {
      filename: `${slug}.${type.extension}`,
      contentType: type.contentType,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Product image upload failed:', message)
    // Not configured: the setup is missing; otherwise the bucket failed
    throw message.startsWith('Object storage is not configured')
      ? fail(503, 'Service Unavailable', message)
      : fail(502, 'Bad Gateway', `The image could not be stored. ${message}`)
  }
})
