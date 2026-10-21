import nitroWorker from 'nitropack/presets/cloudflare/runtime/cloudflare-module'

// Nitro's own Worker entry, except that a missing `/_nuxt/*` file is never
// cached. Workers Assets gives 404s the year-long immutable Cache-Control from
// `_headers` too, so a chunk asked for during a deploy, or by an old tab,
// could stay a 404 in browsers and at the edge.
export default {
  ...nitroWorker,
  async fetch(request: Request, env: unknown, context: unknown) {
    const response = await nitroWorker.fetch(request, env, context)
    if (response.status !== 404 || !new URL(request.url).pathname.startsWith('/_nuxt/')) {
      return response
    }
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'no-store')
    return new Response(response.body, { status: 404, headers })
  },
}
