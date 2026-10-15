// Object keys: checked for path tricks, and encoded for URLs

// Percent-encodes each segment for HTTP URLs, keeping `/`. Not for R2 binding keys.
export const encodeObjectKeyForUrl = (key: string): string =>
  key.split('/').map((segment) => encodeURIComponent(segment)).join('/')

// A key without leading or trailing slashes; refuses `.` and `..` segments
export const normalizePath = (path: string): string => {
  const normalized = path.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid storage path segment.')
  }
  return parts.join('/')
}

// The public address of a key: the configured public URL plus the key
export const publicUrlFor = (publicUrl: string, key: string): string =>
  `${publicUrl.endsWith('/') ? publicUrl : `${publicUrl}/`}${encodeObjectKeyForUrl(key)}`
