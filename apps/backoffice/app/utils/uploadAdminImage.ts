// Staff image upload to object storage under a folder prefix.
export type AdminImageFolder = 'products' | 'offers' | 'brands' | 'categories'

export const uploadAdminImage = async (
  file: File,
  { folder, slug }: { folder: AdminImageFolder; slug: string },
) => {
  const body = new FormData()
  body.append('folder', folder)
  body.append('slug', slug)
  body.append('file', file)
  return await ($fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>)<{
    key: string
    url: string
  }>('/api/admin/product-images', { method: 'POST', body })
}

export const isStorageSlug = (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim())
