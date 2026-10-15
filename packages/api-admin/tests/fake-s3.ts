import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll } from 'vitest'

// A stand-in for an S3-compatible bucket (GET and PUT on /<bucket>/<key>):
// keeps what is uploaded, and refuses uploads to the keys `failWhen` picks.
export type StoredObject = { body: Buffer; headers: Record<string, string | string[] | undefined> }

export const startFakeS3 = async ({ bucket = 'products', publicUrl = 'http://cdn.test/' } = {}) => {
  const objects = new Map<string, StoredObject>()
  const state = { failWhen: (_key: string) => false }
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)
    const key = path.replace(`/${bucket}/`, '')
    if (request.method === 'GET') {
      response.writeHead(objects.has(key) ? 200 : 404).end()
      return
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      if (state.failWhen(key)) {
        response.writeHead(500).end('<Error><Code>InternalError</Code></Error>')
        return
      }
      objects.set(key, { body: Buffer.concat(chunks), headers: request.headers })
      response.writeHead(200).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))
  const { port } = server.address() as AddressInfo

  // The built server uploads there
  process.env.NUXT_S3_ACCESS_KEY = 'test-access-key'
  process.env.NUXT_S3_SECRET_KEY = 'test-secret-key'
  process.env.NUXT_S3_BUCKET_NAME = bucket
  process.env.NUXT_S3_ENDPOINT_URL = `http://127.0.0.1:${port}`
  process.env.NUXT_S3_REGION = 'auto'
  process.env.NUXT_S3_PUBLIC_URL = publicUrl

  return {
    objects,
    // Uploads to the keys this picks get an error from the bucket
    failWhen: (pick: (key: string) => boolean) => (state.failWhen = pick),
  }
}
