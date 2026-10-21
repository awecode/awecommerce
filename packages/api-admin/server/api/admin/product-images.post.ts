// Uploads an admin image (multipart: `file`, `slug`, optional `folder`) and
// answers with its public URL. Folders: products (default), offers, brands,
// categories. Key is <folder>/<slug>.<ext> (<folder>/<slug>-1.<ext> when
// taken). Extension from the file bytes: JPEG, PNG or WebP, up to 8 MiB.
const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024

const FOLDERS = new Set(['products', 'offers', 'brands', 'categories'])

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
  const folderRaw = parts.find((part) => part.name === 'folder')?.data.toString('utf8').trim() || 'products'
  if (!file) {
    throw fail(400, 'Bad Request', 'Send the image as the file field.')
  }
  if (!FOLDERS.has(folderRaw)) {
    throw fail(422, 'Unprocessable Entity', `Folder must be one of: ${[...FOLDERS].join(', ')}.`)
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
      filename: `${folderRaw}/${slug}.${type.extension}`,
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
