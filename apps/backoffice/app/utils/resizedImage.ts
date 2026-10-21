// URL of a square crop for list avatars, when image resizing is on. Unset,
// blob and data URLs pass through.
export const resizedImage = (src: string | null | undefined, width: number) => {
  if (!src || src.startsWith('blob:') || src.startsWith('data:')) return src || undefined
  return useImage()(src, { width, height: width, fit: 'cover', format: 'webp' })
}
