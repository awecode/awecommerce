// Every /api/admin route is for staff only. Set here rather than through
// NUXT_AUTH_ADMIN_ONLY_API_ROUTES, so a missing variable cannot open them.
// The path is normalized (decoded, repeated slashes, case) before matching, so
// spelling a path differently cannot skip the check.
export default defineEventHandler(async (event) => {
  const path = decodeURIComponent(getRequestURL(event).pathname)
    .replace(/\/+/g, '/')
    .toLowerCase()
  if (path.startsWith('/api/admin')) {
    await requireAdmin(event)
  }
})
