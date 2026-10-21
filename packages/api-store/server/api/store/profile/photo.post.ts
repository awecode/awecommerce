import { eq } from 'drizzle-orm'
import { users } from '../../../../../auth/server/db/schema'

// Stores the signed-in buyer's profile photo (multipart `file`) and makes it
// their account's image, so a profile photo is always one stored here.
// Answers `{ url }`. The key is profiles/<userId>.<ext>, numbered when taken
// (each new photo gets a new key; the old one stays in the bucket). JPEG, PNG
// or WebP, up to 8 MiB.
const MAX_PROFILE_PHOTO_BYTES = 8 * 1024 * 1024

const fail = (statusCode: number, statusMessage: string, message: string) => createError({ statusCode, statusMessage, message })

export default defineServiceHandler(async (event) => {
  const user = await requireUser(event)
  // Refused before reading, when the request says it is too big
  const length = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (length > MAX_PROFILE_PHOTO_BYTES + 64 * 1024) {
    throw fail(413, 'Payload Too Large', 'Photos can be up to 8 MB.')
  }
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find((part) => part.name === 'file' && part.filename !== undefined)
  if (!file) {
    throw fail(400, 'Bad Request', 'Send the photo as the file field.')
  }
  if (file.data.byteLength > MAX_PROFILE_PHOTO_BYTES) {
    throw fail(413, 'Payload Too Large', 'Photos can be up to 8 MB.')
  }
  const type = imageType(file.data)
  if (!type) {
    throw fail(415, 'Unsupported Media Type', 'Photos must be JPEG, PNG or WebP.')
  }
  let url: string
  try {
    ;({ url } = await uploadToObjectStorage(event, new Uint8Array(file.data), {
      filename: `profiles/${user.id}.${type.extension}`,
      contentType: type.contentType,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Profile photo upload failed:', message)
    throw message.startsWith('Object storage is not configured')
      ? fail(503, 'Service Unavailable', message)
      : fail(502, 'Bad Gateway', `The photo could not be stored. ${message}`)
  }
  await useDb().update(users).set({ image: url, updatedAt: new Date() }).where(eq(users.id, user.id))
  return { url }
})
