// A real R2 bucket binding (Cloudflare Workers), used directly

export interface R2Binding {
  put: (key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | string | Blob | null, options?: {
    httpMetadata?: Record<string, string>
    customMetadata?: Record<string, string>
  }) => Promise<Record<string, unknown> | null>
  get: (key: string) => Promise<unknown | null>
}

// Only a value with put and get counts as a binding (not, for example, a
// string of the same name)
export const isR2Binding = (value: unknown): value is R2Binding =>
  typeof value === 'object' && value !== null
  && typeof (value as R2Binding).put === 'function'
  && typeof (value as R2Binding).get === 'function'

// HTTP headers as R2 stores them: content headers as httpMetadata, the rest
// as customMetadata
// https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#http-metadata
const httpMetadataKeys: Record<string, string> = {
  'content-type': 'contentType',
  'content-disposition': 'contentDisposition',
  'content-language': 'contentLanguage',
  'content-encoding': 'contentEncoding',
  'cache-control': 'cacheControl',
}

export const r2Backend = (binding: R2Binding) => ({
  name: 'r2-binding',

  exists: async (key: string): Promise<boolean> => (await binding.get(key)) !== null,

  put: async (key: string, body: Uint8Array<ArrayBuffer>, headers: Record<string, string>): Promise<void> => {
    const httpMetadata: Record<string, string> = {}
    const customMetadata: Record<string, string> = {}
    for (const [name, value] of Object.entries(headers)) {
      const metadataKey = httpMetadataKeys[name.toLowerCase()]
      if (metadataKey) httpMetadata[metadataKey] = value
      else if (name.toLowerCase() !== 'content-length') customMetadata[name] = value
    }
    // The bytes are already in memory (at most 8 MiB), so no stream length
    // handling is needed
    const result = await binding.put(key, body, {
      httpMetadata,
      ...(Object.keys(customMetadata).length ? { customMetadata } : {}),
    })
    if (!result) {
      throw new Error('Could not upload to R2.')
    }
  },
})
