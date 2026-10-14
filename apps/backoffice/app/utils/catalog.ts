// A URL slug from a name: "Men's Shirts" becomes "mens-shirts"
export const slugify = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

type ApiError = { data?: { message?: string; data?: { code?: string } }; message?: string }

// The API's message for a failed request, for showing in a toast
export const apiErrorMessage = (error: unknown) =>
  (error as ApiError)?.data?.message ?? (error as ApiError)?.message ?? 'Something went wrong'

// Whether the request failed because the record is still used elsewhere
export const isInUse = (error: unknown) => (error as ApiError)?.data?.data?.code === 'InUse'
