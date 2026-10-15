import { AwsClient } from 'aws4fetch'
import { encodeObjectKeyForUrl } from './keys'

// An S3-compatible bucket over HTTP, signed with aws4fetch. This is also how
// R2 is used from Node (its S3 endpoint).
export type S3Config = {
  accessKey: string
  secretKey: string
  bucketName: string
  endpointUrl: string
  region: string
}

export const isS3Configured = (config: Partial<S3Config>): config is S3Config =>
  Boolean(config.accessKey && config.secretKey && config.bucketName && config.endpointUrl && config.region)

export const s3Backend = (config: S3Config) => {
  const client = new AwsClient({
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
    service: 's3',
    region: config.region,
    // A failing bucket answers within about a second (aws4fetch's default is
    // 10 retries, ~25s)
    retries: 2,
  })
  const objectUrl = (key: string) => `${config.endpointUrl.replace(/\/$/, '')}/${config.bucketName}/${encodeObjectKeyForUrl(key)}`

  return {
    name: 's3',

    exists: async (key: string): Promise<boolean> => {
      const response = await client.fetch(objectUrl(key), { method: 'GET' })
      if (response.status === 404 || response.status === 403) {
        return false
      }
      if (!response.ok) {
        throw new Error(`Could not check object storage: ${response.status} ${response.statusText}`)
      }
      return true
    },

    put: async (key: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>): Promise<void> => {
      const response = await client.fetch(objectUrl(key), {
        method: 'PUT',
        body,
        headers: { ...headers, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD' },
      })
      if (!response.ok) {
        throw new Error(`Could not upload to object storage: ${response.status} ${response.statusText}`)
      }
    },
  }
}
