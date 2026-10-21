// Nitro's own Cloudflare Worker entry, which cloudflare-entry.ts wraps. Nuxt
// provides Nitro at build time; api-core does not depend on it directly.
declare module 'nitropack/presets/cloudflare/runtime/cloudflare-module' {
  const worker: {
    fetch: (request: Request, env: unknown, context: unknown) => Promise<Response>
    [handler: string]: unknown
  }
  export default worker
}
