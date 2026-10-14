// Unknown /api paths get a 404 instead of falling through to the page renderer
export default defineEventHandler(() => {
  throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Not found' })
})
