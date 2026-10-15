import type { InternalApi } from 'nitropack'

// Typed calls to API routes without a path parameter, by their exact path.
// Nitro's typed $fetch matches the path against every route, which goes past
// TypeScript's depth limit (TS2321) now that the API has this many routes;
// looking the path up as is does not. Paths with an id use an untyped $fetch.
type Response<P extends keyof InternalApi, M extends string> = M extends keyof InternalApi[P] ? InternalApi[P][M] : unknown

export const apiGet = <P extends keyof InternalApi>(path: P, options?: Record<string, unknown>) =>
  ($fetch as (url: string, options?: object) => Promise<Response<P, 'get'>>)(path, options)

export const apiPost = <P extends keyof InternalApi>(path: P, options: Record<string, unknown>) =>
  ($fetch as (url: string, options?: object) => Promise<Response<P, 'post'>>)(path, { ...options, method: 'POST' })

// A route with a path parameter: typed by its key (such as
// '/api/admin/orders/:id'), called at the real path
export const apiGetAt = <P extends keyof InternalApi>(route: P, path: string, options?: Record<string, unknown>) =>
  ($fetch as (url: string, options?: object) => Promise<Response<P, 'get'>>)(path, options)
