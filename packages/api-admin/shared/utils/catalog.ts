import { z } from 'zod'

// Request bodies for the admin catalog routes, shared with the backoffice's
// forms. Only the shape is checked here; the library checks the rest (custom
// fields, variant options) and answers with a 422.

// Money as a decimal string, as the library stores it
const decimal = z.string().regex(/^\d+(\.\d+)?$/)
const text = z.string().trim().min(1)
const optionalText = z.string().nullable().optional()
const id = z.number().int()

const customField = z.object({
  label: z.string(),
  required: z.boolean(),
  maxLength: z.number().int(),
})

const productFields = z.object({
  name: text,
  slug: text,
  description: optionalText,
  specification: optionalText,
  link: optionalText,
  thumbnail: optionalText,
  brandId: id.nullable().optional(),
  categoryId: id.nullable().optional(),
  productClassId: id.nullable().optional(),
  status: z.enum(['Draft', 'Published']).optional(),
  isFeatured: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isActive: z.boolean().optional(),
  extraInfo: z.record(z.string(), z.unknown()).optional(),
  customFields: z.array(customField).optional(),
  // Image URLs, in order; replaces the product's images
  images: z.array(text).optional(),
  // Product ids; replaces the related products
  relatedProducts: z.array(id).optional(),
})

const variantFields = z.object({
  sku: text,
  // Short label such as "M / Red"
  title: optionalText,
  price: decimal.nullable().optional(),
  discountedPrice: decimal.nullable().optional(),
  inventoryCost: decimal.nullable().optional(),
  stockQuantity: z.number().int().optional(),
  // One of the product's images
  imageId: id.nullable().optional(),
  isActive: z.boolean().optional(),
  // Option name to value, such as { Size: 'M' }; replaces the variant's options
  options: z.record(z.string(), z.string()).optional(),
})

// A product with its first variant
export const createProductSchema = productFields.extend(
  variantFields.pick({ sku: true, price: true, discountedPrice: true, inventoryCost: true, stockQuantity: true }).shape,
)
export const updateProductSchema = productFields.partial()

// Changes for several products at once (publish, unpublish, activate, ...)
export const bulkProductSchema = z.object({
  ids: z.array(id).min(1).max(100),
  changes: z
    .object({
      status: z.enum(['Draft', 'Published']).optional(),
      isActive: z.boolean().optional(),
      isFeatured: z.boolean().optional(),
      isBestSeller: z.boolean().optional(),
    })
    .refine((changes) => Object.values(changes).some((value) => value !== undefined), 'Give at least one change'),
})

// Option name to its values, such as { Size: ['S', 'M'], Colour: ['Red'] }
export const generateVariantsSchema = z.object({
  options: z.record(z.string().trim().min(1), z.array(z.string())),
})

export const createVariantSchema = variantFields
export const updateVariantSchema = variantFields.partial()

export const renameOptionSchema = z.object({ name: text })
export const renameOptionValueSchema = z.object({ value: text })

const brandFields = z.object({
  name: text,
  slug: text,
  logo: optionalText,
  description: optionalText,
  // Menu position, lowest first
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
})
export const createBrandSchema = brandFields
export const updateBrandSchema = brandFields.partial()

const categoryFields = z.object({
  name: text,
  slug: text,
  parentId: id.nullable().optional(),
  logo: optionalText,
  description: optionalText,
  isActive: z.boolean().optional(),
})
export const createCategorySchema = categoryFields
export const updateCategorySchema = categoryFields.partial()

const productClassFields = z.object({
  name: text,
  slug: text,
  description: optionalText,
  trackStock: z.boolean().optional(),
  // Tax percentage for its products; empty uses the store default
  taxRate: decimal.nullable().optional(),
  isActive: z.boolean().optional(),
})
export const createProductClassSchema = productClassFields
export const updateProductClassSchema = productClassFields.partial()
