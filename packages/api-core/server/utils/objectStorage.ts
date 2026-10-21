import type { H3Event } from 'h3'
import { normalizePath, publicUrlFor } from '../storage/keys'
import { isR2Binding, r2Backend } from '../storage/r2'
import { isS3Configured, s3Backend } from '../storage/s3'

// Images in object storage (the backoffice's uploads and buyers' profile
// photos), shown from their public URL. Return types are written out: this file is auto-imported, and
// inferred backend types would weigh on the apps' typed $fetch routes.

type Backend = {
  name: string
  exists: (key: string) => Promise<boolean>
  put: (key: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>) => Promise<void>
}

const MAX_CLASH_ATTEMPTS = 1000

// The bucket to use, in this order: a real R2 binding named R2 (on the global
// scope, Nitro's __env__, or a Nitro Cloudflare deploy's request context);
// else the S3-compatible client from runtimeConfig.s3. process.env.R2 is not
// looked at: Cloudflare puts only text values there, never a bucket.
const objectStorage = (event: H3Event): { backend: Backend; publicUrl: string } => {
  const { s3 } = useRuntimeConfig(event)
  const globals = globalThis as { R2?: unknown; __env__?: { R2?: unknown } }
  const context = event.context as { cloudflare?: { env?: { R2?: unknown } } }
  const binding = [globals.R2, globals.__env__?.R2, context.cloudflare?.env?.R2].find(isR2Binding)
  const backend = binding ? r2Backend(binding) : isS3Configured(s3) ? s3Backend(s3) : null
  if (!backend || !s3.publicUrl) {
    throw new Error(
      'Object storage is not configured. Bind an R2 bucket named R2, or set NUXT_S3_ACCESS_KEY, NUXT_S3_SECRET_KEY, '
      + 'NUXT_S3_BUCKET_NAME, NUXT_S3_ENDPOINT_URL and NUXT_S3_REGION; and set NUXT_S3_PUBLIC_URL either way.',
    )
  }
  return { backend, publicUrl: s3.publicUrl }
}

// Stores the file under `filename` (such as shirt.jpg), or, when that key is
// taken, shirt-1.jpg, shirt-2.jpg and so on: nothing is overwritten. Returns
// the key and its public URL.
export const uploadToObjectStorage = async (
  event: H3Event,
  body: Uint8Array<ArrayBuffer>,
  { filename, contentType }: { filename: string; contentType: string },
): Promise<{ key: string; url: string }> => {
  const { backend, publicUrl } = objectStorage(event)
  const base = normalizePath(filename)
  const dot = base.lastIndexOf('.')
  const [name, extension] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, '']

  let key = base
  for (let counter = 1; await backend.exists(key); counter++) {
    if (counter > MAX_CLASH_ATTEMPTS) {
      throw new Error(`Could not find a free name for ${base} after ${MAX_CLASH_ATTEMPTS} attempts.`)
    }
    key = `${name}-${counter}${extension}`
  }

  await backend.put(key, body, {
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Content-Length': String(body.byteLength),
    // A key is never written twice, so its content never changes
    'Cache-Control': 'public, max-age=31536000, immutable',
  })
  return { key, url: publicUrlFor(publicUrl, key) }
}
