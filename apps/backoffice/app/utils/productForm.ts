import { z } from 'zod'

// The product page's form: the product's fields and its variants, edited
// together and saved with one Save. Money stays text, as the API sends it.

export type VariantOption = { name: string; value: string }

export type VariantRow = {
  // Stable across saves, for Vue's keys and for matching saved rows
  key: string
  // Missing until the variant is saved
  id?: number
  options: VariantOption[]
  sku: string
  price: string
  discountedPrice: string
  inventoryCost: string
  stockQuantity: number
  isActive: boolean
  // An existing variant to delete on save
  removed?: boolean
}

export type CustomField = { label: string; required: boolean; maxLength: number }

export type ProductForm = {
  name: string
  slug: string
  description: string
  specification: string
  link: string
  status: 'Draft' | 'Published'
  isActive: boolean
  isFeatured: boolean
  isBestSeller: boolean
  categoryId: number | null
  brandId: number | null
  productClassId: number | null
  images: string[]
  thumbnail: string | null
  customFields: CustomField[]
  relatedProducts: { id: number; name: string }[]
  variants: VariantRow[]
}

let lastKey = 0
const newKey = () => `row-${++lastKey}`

// "42.50000000" from the database is "42.5"
export const trimDecimal = (value: string | number | null | undefined) =>
  value === null || value === undefined ? '' : String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

export const newVariantRow = (options: VariantOption[] = []): VariantRow => ({
  key: newKey(),
  options,
  sku: '',
  price: '',
  discountedPrice: '',
  inventoryCost: '',
  stockQuantity: 0,
  isActive: true,
})

export const emptyProductForm = (): ProductForm => ({
  name: '',
  slug: '',
  description: '',
  specification: '',
  link: '',
  status: 'Draft',
  isActive: true,
  isFeatured: false,
  isBestSeller: false,
  categoryId: null,
  brandId: null,
  productClassId: null,
  images: [],
  thumbnail: null,
  customFields: [],
  relatedProducts: [],
  variants: [newVariantRow()],
})

type ApiVariant = {
  id: number
  sku: string
  price: string | null
  discountedPrice: string | null
  inventoryCost: string | null
  stockQuantity: number | null
  isActive: boolean
  options: VariantOption[]
}

type ApiProduct = Pick<ProductForm, 'name' | 'slug' | 'images'> & {
  description: string | null
  specification: string | null
  link: string | null
  thumbnail: string | null
  status: 'Draft' | 'Published' | null
  isActive: boolean | null
  isFeatured: boolean | null
  isBestSeller: boolean | null
  categoryId: number | null
  brandId: number | null
  productClassId: number | null
  customFields: CustomField[]
  relatedProducts: { id: number; name: string }[]
  variants: ApiVariant[]
}

export const productFormFrom = (product: ApiProduct): ProductForm => ({
  name: product.name,
  slug: product.slug,
  description: product.description ?? '',
  specification: product.specification ?? '',
  link: product.link ?? '',
  status: product.status ?? 'Draft',
  isActive: product.isActive ?? true,
  isFeatured: product.isFeatured ?? false,
  isBestSeller: product.isBestSeller ?? false,
  categoryId: product.categoryId,
  brandId: product.brandId,
  productClassId: product.productClassId,
  images: [...product.images],
  thumbnail: product.thumbnail,
  customFields: product.customFields.map((field) => ({ ...field })),
  relatedProducts: product.relatedProducts.map(({ id, name }) => ({ id, name })),
  variants: product.variants.map((variant) => ({
    key: newKey(),
    id: variant.id,
    options: variant.options.map(({ name, value }) => ({ name, value })),
    sku: variant.sku,
    price: trimDecimal(variant.price),
    discountedPrice: trimDecimal(variant.discountedPrice),
    inventoryCost: trimDecimal(variant.inventoryCost),
    stockQuantity: variant.stockQuantity ?? 0,
    isActive: variant.isActive,
  })),
})

// "Size: M, Colour: Red", or "Default" for a variant without options
export const variantLabel = (row: Pick<VariantRow, 'options'>) =>
  row.options.length ? row.options.map((o) => `${o.name}: ${o.value}`).join(', ') : 'Default'

const money = z.string().trim().regex(/^(\d+(\.\d+)?)?$/, 'Enter an amount, such as 12.50')

export const productFormSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name'),
  slug: z.string().trim().min(1, 'Enter a slug'),
  customFields: z.array(z.object({
    label: z.string().trim().min(1, 'Enter a label'),
    maxLength: z.number().int().min(1, 'At least 1'),
  })),
  variants: z.array(z.object({
    sku: z.string().trim().min(1, 'Enter a SKU'),
    price: money,
    discountedPrice: money,
    inventoryCost: money,
    stockQuantity: z.number().int().min(0, 'Cannot be negative'),
    options: z.array(z.object({ value: z.string().trim().min(1, 'Enter a value') })),
  })),
})

const orNull = (value: string) => (value.trim() === '' ? null : value.trim())
// The editor's empty document
const html = (value: string) => (value === '<p></p>' ? null : orNull(value))

// The body for creating or changing the product itself
export const productBody = (form: ProductForm) => ({
  name: form.name.trim(),
  slug: form.slug.trim(),
  description: html(form.description),
  specification: html(form.specification),
  link: orNull(form.link),
  status: form.status,
  isActive: form.isActive,
  isFeatured: form.isFeatured,
  isBestSeller: form.isBestSeller,
  categoryId: form.categoryId,
  brandId: form.brandId,
  productClassId: form.productClassId,
  images: form.images,
  thumbnail: form.thumbnail,
  customFields: form.customFields,
  relatedProducts: form.relatedProducts.map((product) => product.id),
})

// The body for creating or changing a variant
export const variantBody = (row: VariantRow) => ({
  sku: row.sku.trim(),
  price: orNull(row.price),
  discountedPrice: orNull(row.discountedPrice),
  inventoryCost: orNull(row.inventoryCost),
  stockQuantity: row.stockQuantity,
  isActive: row.isActive,
  ...(row.id ? {} : { options: Object.fromEntries(row.options.map((o) => [o.name, o.value.trim()])) }),
})
