// An uploaded image's real type, from its first bytes; the declared type and
// the file name are not trusted. JPEG, PNG or WebP, else null.
export const imageType = (bytes: Uint8Array): { extension: string; contentType: string } | null => {
  const starts = (signature: number[], at = 0) => signature.every((byte, i) => bytes[at + i] === byte)
  if (starts([0xFF, 0xD8, 0xFF])) return { extension: 'jpg', contentType: 'image/jpeg' }
  if (starts([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return { extension: 'png', contentType: 'image/png' }
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return { extension: 'webp', contentType: 'image/webp' }
  return null
}
