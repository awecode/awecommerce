import { Exact, paginate, PaginationArgs } from '../../../core/pagination'
import { NotFoundError, ValidationError } from '../../../core/errors'
import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  SQL,
  sql,
} from 'drizzle-orm'

import {
  brands,
  categories,
  CustomField,
  NewBrand,
  NewCategory,
  NewProduct,
  NewProductClass,
  NewProductVariant,
  Product,
  productClasses,
  productImages,
  productOptions,
  productOptionValues,
  productRelatedProducts,
  products,
  productVariantOptionValues,
  productVariants,
  productViews,
  UpdateProduct,
  UpdateProductVariant,
} from '../schemas'
import { orderLines } from '../../order/schemas'
import { alias } from 'drizzle-orm/pg-core'
import { Database } from '../../types'

// Checks the custom fields a product asks the buyer for, and trims the labels
// (answers are stored by label)
const validateCustomFields = (fields: CustomField[]) => {
  const labels = new Set<string>()
  return fields.map((field) => {
    const label = typeof field.label === 'string' ? field.label.trim() : ''
    if (!label) {
      throw new ValidationError('Custom field label is required')
    }
    if (labels.has(label)) {
      throw new ValidationError(`Duplicate custom field label: ${label}`)
    }
    labels.add(label)
    if (typeof field.required !== 'boolean') {
      throw new ValidationError(`Custom field required must be true or false: ${label}`)
    }
    if (!Number.isInteger(field.maxLength) || field.maxLength < 1) {
      throw new ValidationError(`Custom field maxLength must be a positive whole number: ${label}`)
    }
    return { label, required: field.required, maxLength: field.maxLength }
  })
}


// Ids of the given categories and every category under them. UNION skips
// categories already found, so a loop of parents cannot recurse forever.
const categoryTreeIds = (categoryIds: number[]) => sql`(
  WITH RECURSIVE tree(id) AS (
    SELECT c.id FROM ${categories} c WHERE c.id IN ${categoryIds}
    UNION
    SELECT child.id FROM ${categories} child JOIN tree ON child."parentId" = tree.id
  )
  SELECT id FROM tree
)`

// Ids of the categories that are inactive or under an inactive category
const inactiveCategoryIds = sql`(
  WITH RECURSIVE hidden(id) AS (
    SELECT c.id FROM ${categories} c WHERE c."isActive" IS NOT TRUE
    UNION
    SELECT child.id FROM ${categories} child JOIN hidden ON child."parentId" = hidden.id
  )
  SELECT id FROM hidden
)`

// The store's one rule for showing and selling a product: it is active and
// published, and its brand, its product class and its category (with every
// category above it) are not inactive. Works in any query on products.
const listedProduct = and(
  eq(products.isActive, true),
  eq(products.status, 'Published'),
  or(
    isNull(products.brandId),
    sql`${products.brandId} IN (SELECT b.id FROM ${brands} b WHERE b."isActive" IS TRUE)`,
  ),
  or(
    isNull(products.productClassId),
    sql`${products.productClassId} IN (SELECT pc.id FROM ${productClasses} pc WHERE pc."isActive" IS TRUE)`,
  ),
  or(isNull(products.categoryId), sql`${products.categoryId} NOT IN ${inactiveCategoryIds}`),
)!

// Ids of the categories that hold a listed product, and of every category
// above them
const categoriesWithListedProducts = sql`(
  WITH RECURSIVE up(id, "parentId") AS (
    SELECT c.id, c."parentId" FROM ${categories} c
    WHERE c.id IN (SELECT ${products.categoryId} FROM ${products} WHERE ${listedProduct})
    UNION
    SELECT parent.id, parent."parentId" FROM ${categories} parent JOIN up ON parent.id = up."parentId"
  )
  SELECT id FROM up
)`

interface ProductFilter {
  brands?: number[]
  categories?: number[]
  // Makes `categories` also match every category under them
  includeSubcategories?: boolean
  // Only products the store shows (see listedProduct)
  listedOnly?: boolean
  productClass?: number
  status?: Product['status']
  q?: string
  isFeatured?: boolean
  isBestSeller?: boolean
  pagination?: PaginationArgs
  isActive?: boolean
  includeInactiveBrands?: boolean
  includeInactiveCategories?: boolean
  includeInactiveProductClasses?: boolean
  extraFilters?: SQL[]
  qFilter?: SQL
  minPrice?: number
  maxPrice?: number
  // Newest first when not given
  sortBy?: 'priceAsc' | 'priceDesc' | 'nameAsc' | 'nameDesc' | 'newest' | 'oldest'
  getFilters?: () => SQL[]
}

// The lowest selling price among the product's active variants
const minVariantPrice = sql<string | null>`(
  SELECT MIN(COALESCE(${productVariants.discountedPrice}, ${productVariants.price}))
  FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
  AND ${productVariants.isActive} = true
)`

// The highest selling price among the product's active variants
const maxVariantPrice = sql<string | null>`(
  SELECT MAX(COALESCE(${productVariants.discountedPrice}, ${productVariants.price}))
  FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
  AND ${productVariants.isActive} = true
)`

// How many variants the product has, active or not
const variantCount = sql<number>`(
  SELECT COUNT(*)::int FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
)`

// The stock of the product's active variants
const totalStock = sql<number>`(
  SELECT COALESCE(SUM(${productVariants.stockQuantity}), 0)::int FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
  AND ${productVariants.isActive} = true
)`

// Whether the product's stock is counted: by its class, and always without one
const tracksStock = sql<boolean>`COALESCE((
  SELECT ${productClasses.trackStock} FROM ${productClasses}
  WHERE ${productClasses.id} = ${products.productClassId}
), true)`

// Whether the product can be bought: stock is not counted, or an active
// variant has some
const inStock = sql<boolean>`(NOT ${tracksStock} OR EXISTS (
  SELECT 1 FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
  AND ${productVariants.isActive} = true
  AND ${productVariants.stockQuantity} > 0
))`

// More of a variant was asked for than is in stock. `available` is what is
// left, so the buyer can be told.
class OutOfStockError extends Error {
  constructor(
    public variantId: number,
    public sku: string,
    public available: number,
  ) {
    super(available > 0 ? `Only ${available} left of ${sku}` : `${sku} is out of stock`)
    this.name = 'OutOfStockError'
  }
}

// A variant's stock: `stock` is null when its stock is not counted
type StockLevel = { variantId: number; sku: string; stock: number | null }

type SingleVariant = {
  id: number
  sku: string
  price: string | null
  discountedPrice: string | null
  stockQuantity: number | null
  isActive: boolean
}

// The product's variant when it has exactly one, so a list can show and edit
// its price and stock in place; null otherwise. Prices stay decimal strings.
const singleVariant = sql<SingleVariant | null>`(
  SELECT json_build_object(
    'id', v.id,
    'sku', v.sku,
    'price', v.price::text,
    'discountedPrice', v."discountedPrice"::text,
    'stockQuantity', v."stockQuantity",
    'isActive', v."isActive"
  )
  FROM ${productVariants} v
  WHERE v."productId" = ${products.id}
  AND (SELECT COUNT(*) FROM ${productVariants} w WHERE w."productId" = ${products.id}) = 1
)`

// Loads a variant's option values with their option, for withVariantOptions
const optionValuesWithOption = {
  with: { optionValue: { with: { option: true } } },
} as const

type VariantWithOptionValues = {
  optionValues: Array<{
    optionValue: { value: string; option: { id: number; name: string } }
  }>
}

// Replaces a variant's loaded option values with name and value pairs, in the
// order the product's options were created
const withVariantOptions = <V extends VariantWithOptionValues>({
  optionValues,
  ...variant
}: V) => ({
  ...variant,
  options: optionValues
    .map(({ optionValue }) => optionValue)
    .sort((a, b) => a.option.id - b.option.id)
    .map(({ value, option }) => ({ name: option.name, value })),
})

// What can be changed on many products at once
type BulkProductChanges = Pick<UpdateProduct, 'status' | 'isActive' | 'isFeatured' | 'isBestSeller'>

// At most this many variants from one generateVariants call
const MAX_GENERATED_VARIANTS = 100

// A SKU part from an option value: Dark Blue becomes DARK-BLUE
const skuPart = (value: string, index: number) =>
  value.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || String(index + 1)

class ProductService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  // Creates the product with its first variant, made from the variant fields
  async create(product: NewProduct) {
    return await this.db.transaction(async (tx) => {
      const {
        images,
        relatedProducts,
        sku,
        price,
        discountedPrice,
        inventoryCost,
        stockQuantity,
        ...productData
      } = product
      if (productData.customFields) {
        productData.customFields = validateCustomFields(productData.customFields)
      }
      const result = await tx
        .insert(products)
        .values(productData)
        .returning()
      if (images) {
        const productImageService = new ProductImageService(tx)
        await productImageService.setImages(result[0].id, images)
      }
      if (relatedProducts) {
        const relatedProductService = new RelatedProductService(tx)
        await relatedProductService.setRelatedProducts(
          result[0].id,
          relatedProducts,
        )
      }
      const variant = await new ProductVariantService(tx).create(result[0].id, {
        sku,
        price,
        discountedPrice,
        inventoryCost,
        stockQuantity,
      })
      return { ...result[0], variants: [variant] }
    })
  }

  async get(productId: number) {
    const result = await this.db.query.products.findFirst({
      with: {
        variants: {
          with: {
            image: true,
            optionValues: optionValuesWithOption,
          },
          orderBy: asc(productVariants.id),
        },
        options: {
          with: {
            values: { orderBy: asc(productOptionValues.id) },
          },
          orderBy: asc(productOptions.id),
        },
        relatedProducts: {
          with: {
            relatedProduct: {
              with: {
                category: true,
                brand: true,
              },
            },
          },
        },
        category: {
          columns: {
            id: true,
            name: true,
            slug: true,
          },
        },
        brand: {
          columns: {
            id: true,
            name: true,
            slug: true,
          },
        },
        productClass: {
          columns: {
            id: true,
            name: true,
            slug: true,
            trackStock: true,
          },
        },
        images: true,
      },
      where: eq(products.id, productId),
    })
    return result
      ? {
          ...result,
          variants: result.variants.map(withVariantOptions),
          relatedProducts: result.relatedProducts.map(
            (r: any) => r.relatedProduct,
          ),
          images: result.images.map((image: any) => image.imageUrl),
        }
      : null
  }

  async getBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
    return result[0]
  }

  // The given products that the store shows (see listedProduct), by id
  async listedProductIds(productIds: number[]) {
    if (!productIds.length) {
      return []
    }
    const rows = await this.db
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, productIds), listedProduct))
      .orderBy(asc(products.id))
    return rows.map((row) => row.id)
  }

  async update(productId: number, product: UpdateProduct) {
    return await this.db.transaction(async (tx) => {
      const { images, relatedProducts, ...productData } = product
      if (productData.customFields) {
        productData.customFields = validateCustomFields(productData.customFields)
      }
      const result = await tx
        .update(products)
        .set({
          ...productData,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(products.id, productId))
        .returning()
      if (!result[0]) {
        throw new NotFoundError(`Product not found: ${productId}`)
      }
      if (images) {
        const productImageService = new ProductImageService(tx)
        await productImageService.setImages(productId, images)
      }
      if (relatedProducts) {
        const relatedProductService = new RelatedProductService(tx)
        await relatedProductService.setRelatedProducts(productId, relatedProducts)
      }
      return result[0]
    })
  }

  // Changes several products at once: all of them, or none when one is missing
  async updateMany(productIds: number[], changes: BulkProductChanges) {
    const ids = [...new Set(productIds)]
    if (!ids.length) {
      return []
    }
    return await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(products)
        .set({ ...changes, updatedAt: new Date().toISOString() })
        .where(inArray(products.id, ids))
        .returning()
      const missing = ids.find((id) => !updated.some((product) => product.id === id))
      if (missing !== undefined) {
        throw new NotFoundError(`Product not found: ${missing}`)
      }
      return updated
    })
  }

  async delete(productId: number) {
    const result = await this.db
      .delete(products)
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async list<F extends ProductFilter = {}>(filter: Exact<F, ProductFilter>) {
    const where: SQL[] = []

    if (filter.listedOnly) {
      where.push(listedProduct)
    }

    if (filter.getFilters) {
      where.push(...filter.getFilters())
    } else {
      if (filter.brands && filter.brands.length) {
        where.push(
          or(...filter.brands.map((brandId) => eq(products.brandId, brandId)))!,
        )
      }
      if (filter.categories && filter.categories.length) {
        where.push(
          filter.includeSubcategories
            ? sql`${products.categoryId} IN ${categoryTreeIds(filter.categories)}`
            : or(
                ...filter.categories.map((categoryId) =>
                  eq(products.categoryId, categoryId),
                ),
              )!,
        )
      }
      if (filter.productClass) {
        where.push(eq(products.productClassId, filter.productClass))
      }
      if (filter.status) {
        where.push(eq(products.status, filter.status))
      }
      if (filter.isFeatured !== undefined) {
        where.push(eq(products.isFeatured, filter.isFeatured))
      }
      if (filter.isBestSeller !== undefined) {
        where.push(eq(products.isBestSeller, filter.isBestSeller))
      }
      if (filter.qFilter) {
        where.push(filter.qFilter)
      } else if (filter.q) {
        where.push(
          or(
            Number(filter.q) ? eq(products.id, Number(filter.q)) : undefined,
            ilike(products.name, `%${filter.q}%`),
          )!,
        )
      }

      if (filter.isActive !== undefined) {
        where.push(eq(products.isActive, filter.isActive))
      }

      if (!filter.includeInactiveBrands) {
        where.push(or(isNull(products.brandId), eq(brands.isActive, true))!)
      }

      // Also hides products under an inactive category, at any depth
      if (!filter.includeInactiveCategories) {
        where.push(
          or(
            isNull(products.categoryId),
            sql`${products.categoryId} NOT IN ${inactiveCategoryIds}`,
          )!,
        )
      }

      if (!filter.includeInactiveProductClasses) {
        where.push(
          or(
            isNull(products.productClassId),
            eq(productClasses.isActive, true),
          )!,
        )
      }

      if (filter.minPrice) {
        where.push(sql`${minVariantPrice} >= ${filter.minPrice}`)
      }

      if (filter.maxPrice) {
        where.push(sql`${minVariantPrice} <= ${filter.maxPrice}`)
      }

      if (filter.extraFilters) {
        where.push(...filter.extraFilters)
      }
    }

    // The id breaks ties, so pages do not overlap
    const orderBy: SQL[] = {
      priceAsc: [sql`${minVariantPrice}`, asc(products.id)],
      priceDesc: [desc(minVariantPrice), desc(products.id)],
      nameAsc: [asc(products.name), asc(products.id)],
      nameDesc: [desc(products.name), desc(products.id)],
      newest: [desc(products.createdAt), desc(products.id)],
      oldest: [asc(products.createdAt), asc(products.id)],
    }[filter.sortBy ?? 'newest']

    let query = this.db
      .select({
        ...getTableColumns(products),
        minPrice: minVariantPrice,
        maxPrice: maxVariantPrice,
        variantCount,
        totalStock,
        singleVariant,
        inStock,
        brand: getTableColumns(brands),
        category: getTableColumns(categories),
        productClass: getTableColumns(productClasses),
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .orderBy(...orderBy)
      .where(and(...where))

    return await paginate(
      filter as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      async () =>
        Number(
          (
            await this.db
              .select({ count: sql<number>`count(*)` })
              .from(products)
              .leftJoin(brands, eq(products.brandId, brands.id))
              .leftJoin(categories, eq(products.categoryId, categories.id))
              .leftJoin(
                productClasses,
                eq(products.productClassId, productClasses.id),
              )
              .where(and(...where))
          )[0]!.count,
        ),
    )
  }

  async markAsFeatured(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isFeatured: true })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async unmarkAsFeatured(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isFeatured: false })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async markAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: true })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async unmarkAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: false })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async markAsActive(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isActive: true })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async markAsInactive(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, productId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product not found: ${productId}`)
    }
    return result[0]
  }

  async logProductView(productId: number, userId: string) {
    await this.db.insert(productViews).values({ productId, userId })
  }

  async getRecentlyViewedProducts(userId: string, limit: number) {
    const latestViews = this.db
      .selectDistinctOn([productViews.productId], {
        productId: productViews.productId,
        createdAt: productViews.createdAt,
      })
      .from(productViews)
      .leftJoin(products, eq(productViews.productId, products.id))
      .where(and(eq(productViews.userId, userId)))
      .orderBy(productViews.productId, desc(productViews.createdAt))
      .as('latest_views')
    return await this.db
      .select({
        ...getTableColumns(products),
        category: getTableColumns(categories),
        brand: getTableColumns(brands),
        productClass: getTableColumns(productClasses),
      })
      .from(latestViews)
      .leftJoin(products, eq(latestViews.productId, products.id))
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .where(
        and(
          eq(products.isActive, true),
          or(isNull(products.brandId), eq(brands.isActive, true)),
          or(isNull(products.categoryId), eq(categories.isActive, true)),
          or(
            isNull(products.productClassId),
            eq(productClasses.isActive, true),
          ),
        ),
      )
      .orderBy(desc(latestViews.createdAt))
      .limit(limit)
  }

  async hasAnyOrder(productId: number) {
    const result = await this.db
      .select()
      .from(orderLines)
      .where(eq(orderLines.productId, productId))
    return result.length > 0
  }
}
interface BrandFilter {
  q?: string
  isActive?: boolean
  hasActiveProducts?: boolean
  // Only brands with a product the store shows (see listedProduct)
  hasListedProducts?: boolean
  pagination?: PaginationArgs
}
class BrandService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(brand: NewBrand) {
    const result = await this.db.insert(brands).values(brand).returning()
    return result[0]
  }

  async get(brandId: number) {
    const result = await this.db
      .select()
      .from(brands)
      .where(eq(brands.id, brandId))
    return result[0]
  }

  async getBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(brands)
      .where(eq(brands.slug, slug))
    return result[0]
  }

  async update(brandId: number, brand: Partial<NewBrand>) {
    const result = await this.db
      .update(brands)
      .set({
        ...brand,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(brands.id, brandId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Brand not found: ${brandId}`)
    }
    return result[0]
  }

  async delete(brandId: number) {
    const result = await this.db
      .delete(brands)
      .where(eq(brands.id, brandId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Brand not found: ${brandId}`)
    }
    return result[0]
  }

  async hasAnyProduct(brandId: number) {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.brandId, brandId))
    return result.length > 0
  }

  async list<F extends BrandFilter = {}>(filter: Exact<F, BrandFilter>) {
    const where: SQL[] = []

    if (filter.q) {
      where.push(
        or(
          Number(filter.q) ? eq(brands.id, Number(filter.q)) : undefined,
          ilike(brands.name, `%${filter.q}%`),
        )!,
      )
    }

    if (filter.isActive !== undefined) {
      where.push(eq(brands.isActive, filter.isActive))
    }

    if (filter?.hasActiveProducts !== undefined) {
      if (filter.hasActiveProducts) {
        where.push(
          exists(
            this.db
              .select()
              .from(products)
              .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
              .leftJoin(categories, eq(products.categoryId, categories.id))
              .where(
                and(
                  eq(products.brandId, brands.id),
                  eq(products.isActive, true),
                  or(isNull(products.categoryId), eq(categories.isActive, true)),
                  or(
                    isNull(products.productClassId),
                    eq(productClasses.isActive, true),
                  ),
                ),
              ),
          ),
        )
      } else {
        where.push(
          notExists(
            this.db
              .select()
              .from(products)
              .where(
                and(
                  eq(products.brandId, brands.id),
                  eq(products.isActive, true),
                ),
              ),
          ),
        )
      }
    }

    if (filter.hasListedProducts) {
      where.push(
        exists(
          this.db
            .select({ id: products.id })
            .from(products)
            .where(and(eq(products.brandId, brands.id), listedProduct)),
        ),
      )
    }

    const query = this.db
      .select()
      .from(brands)
      .where(and(...where))
      .orderBy(
        asc(brands.order),
        desc(brands.createdAt)
      )

    return await paginate(
      filter as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(brands, and(...where)),
    )
  }

  async markAsActive(brandId: number) {
    const result = await this.db
      .update(brands)
      .set({ isActive: true })
      .where(eq(brands.id, brandId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Brand not found: ${brandId}`)
    }
    return result[0]
  }

  async markAsInactive(brandId: number) {
    const result = await this.db
      .update(brands)
      .set({ isActive: false })
      .where(eq(brands.id, brandId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Brand not found: ${brandId}`)
    }
    return result[0]
  }
}

interface ProductClassFilter {
  q?: string
  isActive?: boolean
  pagination?: PaginationArgs
}

class ProductClassService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(productClass: NewProductClass) {
    const result = await this.db
      .insert(productClasses)
      .values(productClass)
      .returning()
    return result[0]
  }

  async get(productClassId: number) {
    const result = await this.db
      .select()
      .from(productClasses)
      .where(eq(productClasses.id, productClassId))
    return result[0]
  }

  async getBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(productClasses)
      .where(eq(productClasses.slug, slug))
    return result[0]
  }

  async update(productClassId: number, productClass: Partial<NewProductClass>) {
    const result = await this.db
      .update(productClasses)
      .set({
        ...productClass,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(productClasses.id, productClassId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product class not found: ${productClassId}`)
    }
    return result[0]
  }

  async delete(productClassId: number) {
    const result = await this.db
      .delete(productClasses)
      .where(eq(productClasses.id, productClassId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product class not found: ${productClassId}`)
    }
    return result[0]
  }

  async hasAnyProduct(productClassId: number) {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.productClassId, productClassId))
    return result.length > 0
  }

  async list<F extends ProductClassFilter = {}>(filter?: Exact<F, ProductClassFilter>) {
    const where: SQL[] = []

    if (filter?.q) {
      where.push(
        or(
          Number(filter.q)
            ? eq(productClasses.id, Number(filter.q))
            : undefined,
          ilike(productClasses.name, `%${filter.q}%`),
        )!,
      )
    }

    if (filter?.isActive !== undefined) {
      where.push(eq(productClasses.isActive, filter.isActive))
    }

    const query = this.db
      .select()
      .from(productClasses)
      .where(and(...where))
      .orderBy(desc(productClasses.createdAt))

    return await paginate(
      filter as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(productClasses, and(...where)),
    )
  }

  async markAsActive(productClassId: number) {
    const result = await this.db
      .update(productClasses)
      .set({ isActive: true })
      .where(eq(productClasses.id, productClassId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product class not found: ${productClassId}`)
    }
    return result[0]
  }

  async markAsInactive(productClassId: number) {
    const result = await this.db
      .update(productClasses)
      .set({ isActive: false })
      .where(eq(productClasses.id, productClassId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product class not found: ${productClassId}`)
    }
    return result[0]
  }
}

interface CategoryFilter {
  q?: string
  isActive?: boolean
  parentIds?: number[]
  isRootCategory?: boolean
  hasProducts?: boolean
  hasActiveProducts?: boolean
  hasActiveProductWithBrands?: number[]
  // Also leaves out categories under an inactive category
  excludeInactiveBranches?: boolean
  // Only categories with a product the store shows (see listedProduct), in
  // them or in a category under them
  hasListedProducts?: boolean
  pagination?: PaginationArgs
}

class CategoryService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(category: NewCategory) {
    const result = await this.db.insert(categories).values(category).returning()
    return result[0]
  }

  async get(categoryId: number) {
    const result = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, categoryId))
    return result[0]
  }

  async getBySlug(slug: string) {
    const result = await this.db
      .select()
      .from(categories)
      .where(eq(categories.slug, slug))
    return result[0]
  }

  async update(categoryId: number, category: Partial<NewCategory>) {
    if (category.parentId === categoryId) {
      throw new ValidationError('A category cannot be its own parent')
    }
    // The new parent must not be one of this category's subcategories, at any
    // depth, or the tree would loop
    if (category.parentId) {
      const [loop] = await this.db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, category.parentId),
            sql`${categories.id} IN ${categoryTreeIds([categoryId])}`,
          ),
        )
      if (loop) {
        throw new ValidationError('A category cannot be under its own subcategory')
      }
    }
    const result = await this.db
      .update(categories)
      .set({
        ...category,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(categories.id, categoryId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Category not found: ${categoryId}`)
    }
    return result[0]
  }

  async delete(categoryId: number) {
    const result = await this.db
      .delete(categories)
      .where(eq(categories.id, categoryId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Category not found: ${categoryId}`)
    }
    return result[0]
  }

  async hasAnyProduct(categoryId: number) {
    const result = await this.db.$count(
      products,
      eq(products.categoryId, categoryId),
    )
    return result > 0
  }

  async hasSubCategories(categoryId: number) {
    const result = await this.db.$count(
      categories,
      eq(categories.parentId, categoryId),
    )
    return result > 0
  }

  async list<F extends CategoryFilter = {}>(filter?: Exact<F, CategoryFilter>) {
    const where: SQL[] = []

    if (filter?.q) {
      where.push(
        or(
          Number(filter.q) ? eq(categories.id, Number(filter.q)) : undefined,
          ilike(categories.name, `%${filter.q}%`),
        )!,
      )
    }

    if (filter?.hasProducts !== undefined) {
      const productsInCategory = this.db
        .select()
        .from(products)
        .where(eq(products.categoryId, categories.id))
      where.push(
        filter.hasProducts
          ? exists(productsInCategory)
          : notExists(productsInCategory),
      )
    }

    if (filter?.hasActiveProducts !== undefined) {
      if (filter.hasActiveProducts) {
        where.push(
          exists(
            this.db
              .select()
              .from(products)
              .leftJoin(brands, eq(products.brandId, brands.id))
              .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
              .where(
                and(
                  eq(products.categoryId, categories.id),
                  eq(products.isActive, true),
                  or(isNull(products.brandId), eq(brands.isActive, true)),
                  or(
                    isNull(products.productClassId),
                    eq(productClasses.isActive, true),
                  ),
                  filter.hasActiveProductWithBrands
                    ? inArray(products.brandId, filter.hasActiveProductWithBrands)
                    : undefined,
                ),
              ),
          ),
        )
      } else {
        where.push(
          notExists(
            this.db
              .select()
              .from(products)
              .where(
                and(
                  eq(products.categoryId, categories.id),
                  eq(products.isActive, true),
                ),
              ),
          ),
        )
      }
    }

    if (filter?.isRootCategory !== undefined) {
      if (filter.isRootCategory) {
        where.push(isNull(categories.parentId))
      } else {
        where.push(isNotNull(categories.parentId))
      }
    }

    if (filter?.parentIds && filter.parentIds.length) {
      where.push(
        or(
          ...filter.parentIds.map((parentId) =>
            eq(categories.parentId, parentId),
          ),
        )!,
      )
    }

    if (filter?.isActive !== undefined) {
      where.push(eq(categories.isActive, filter.isActive))
    }

    if (filter?.excludeInactiveBranches) {
      where.push(sql`${categories.id} NOT IN ${inactiveCategoryIds}`)
    }

    if (filter?.hasListedProducts) {
      where.push(sql`${categories.id} IN ${categoriesWithListedProducts}`)
    }

    const parentCategories = alias(categories, 'parent_categories')

    const query = this.db
      .select({
        ...getTableColumns(categories),
        parent: getTableColumns(parentCategories),
      })
      .from(categories)
      .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
      .where(and(...where))
      .orderBy(desc(categories.createdAt))

    return await paginate(
      filter as F | undefined,
      (page) => (page ? query.limit(page.limit).offset(page.offset) : query),
      () => this.db.$count(categories, and(...where)),
    )
  }

  async markAsActive(categoryId: number) {
    const result = await this.db
      .update(categories)
      .set({ isActive: true })
      .where(eq(categories.id, categoryId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Category not found: ${categoryId}`)
    }
    return result[0]
  }

  async markAsInactive(categoryId: number) {
    const result = await this.db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, categoryId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Category not found: ${categoryId}`)
    }
    return result[0]
  }
}

class ProductImageService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async getImages(productId: number) {
    const result = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
    return result
  }

  // Replaces the product's images. Variants keep their image when its URL is
  // still in the list.
  async setImages(productId: number, imageUrls: string[]) {
    return await this.db.transaction(async (tx) => {
      const variantImages = await tx
        .select({ id: productVariants.id, imageUrl: productImages.imageUrl })
        .from(productVariants)
        .innerJoin(productImages, eq(productVariants.imageId, productImages.id))
        .where(eq(productVariants.productId, productId))
      await tx.delete(productImages).where(eq(productImages.productId, productId))
      if (!imageUrls.length) {
        return []
      }
      const inserted = await tx
        .insert(productImages)
        .values(imageUrls.map((imageUrl) => ({ productId, imageUrl })))
        .returning()
      for (const variant of variantImages) {
        const image = inserted.find((i) => i.imageUrl === variant.imageUrl)
        if (image) {
          await tx
            .update(productVariants)
            .set({ imageId: image.id })
            .where(eq(productVariants.id, variant.id))
        }
      }
      return inserted
    })
  }
}

class ProductVariantService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async create(productId: number, variant: NewProductVariant) {
    return await this.db.transaction(async (tx) => {
      const variantService = new ProductVariantService(tx)
      const { options, ...variantData } = variant
      await variantService.checkImage(productId, variantData.imageId)
      const [result] = await tx
        .insert(productVariants)
        .values({ ...variantData, productId })
        .returning()
      await variantService.setOptions(result, options ?? {})
      return result
    })
  }

  // Variant with its product, image and options as name and value pairs
  async get(variantId: number) {
    const result = await this.db.query.productVariants.findFirst({
      with: {
        product: true,
        image: true,
        optionValues: optionValuesWithOption,
      },
      where: eq(productVariants.id, variantId),
    })
    return result ? withVariantOptions(result) : null
  }

  async list(productId: number) {
    const result = await this.db.query.productVariants.findMany({
      with: {
        image: true,
        optionValues: optionValuesWithOption,
      },
      where: eq(productVariants.productId, productId),
      orderBy: asc(productVariants.id),
    })
    return result.map(withVariantOptions)
  }

  // Passing options replaces all of the variant's options
  async update(variantId: number, variant: UpdateProductVariant) {
    return await this.db.transaction(async (tx) => {
      const variantService = new ProductVariantService(tx)
      const { options, ...variantData } = variant
      const [existing] = await tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
      if (!existing) {
        throw new NotFoundError(`Product variant not found: ${variantId}`)
      }
      await variantService.checkImage(existing.productId, variantData.imageId)
      const [result] = await tx
        .update(productVariants)
        .set({ ...variantData, updatedAt: new Date().toISOString() })
        .where(eq(productVariants.id, variantId))
        .returning()
      if (options) {
        await variantService.setOptions(result, options)
      }
      return result
    })
  }

  async delete(variantId: number) {
    const result = await this.db
      .delete(productVariants)
      .where(eq(productVariants.id, variantId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product variant not found: ${variantId}`)
    }
    return result[0]
  }

  async markAsActive(variantId: number) {
    return await this.update(variantId, { isActive: true })
  }

  async markAsInactive(variantId: number) {
    return await this.update(variantId, { isActive: false })
  }

  // The stock of the given variants, by id. With `lock`, the rows stay locked
  // until the transaction ends (in id order, so checkouts cannot deadlock).
  async stockLevels(variantIds: number[], { lock = false } = {}) {
    if (!variantIds.length) {
      return new Map<number, StockLevel>()
    }
    let query = this.db
      .select({
        variantId: productVariants.id,
        sku: productVariants.sku,
        stockQuantity: productVariants.stockQuantity,
        tracked: tracksStock,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, variantIds))
      .orderBy(asc(productVariants.id))
      .$dynamic()
    if (lock) {
      query = query.for('update', { of: productVariants })
    }
    const rows = await query
    return new Map(
      rows.map((row) => [
        row.variantId,
        { variantId: row.variantId, sku: row.sku, stock: row.tracked ? (row.stockQuantity ?? 0) : null },
      ]),
    )
  }

  // Throws OutOfStockError for the first variant asked for beyond its stock.
  // `wanted` is the total quantity of each variant, by id.
  async checkStock(wanted: Map<number, number>, options: { lock?: boolean } = {}) {
    const levels = await this.stockLevels([...wanted.keys()], options)
    for (const [variantId, quantity] of wanted) {
      const level = levels.get(variantId)
      if (level && level.stock !== null && quantity > level.stock) {
        throw new OutOfStockError(variantId, level.sku, Math.max(level.stock, 0))
      }
    }
    return levels
  }

  // Creates a variant for every combination of the option values that the
  // product does not have yet, such as { Size: ['S', 'M'], Colour: ['Red'] }.
  // New variants copy the first variant's prices, start with no stock, and
  // get SKUs from its SKU and the values (SHIRT-S-RED). A product's only
  // variant without options takes the first combination instead. Returns the
  // variants it created or changed.
  async generateVariants(productId: number, options: Record<string, string[]>) {
    const values = Object.entries(options).map(([name, list]) => {
      const unique = [...new Set(list.map((value) => value.trim()).filter(Boolean))]
      if (!unique.length) {
        throw new ValidationError(`Give at least one value for ${name}`)
      }
      return [name, unique] as const
    })
    if (!values.length) {
      throw new ValidationError('Give at least one option with values')
    }
    const total = values.reduce((product, [, list]) => product * list.length, 1)
    if (total > MAX_GENERATED_VARIANTS) {
      throw new ValidationError(`Too many combinations: ${total} (at most ${MAX_GENERATED_VARIANTS})`)
    }
    const combinations = values.reduce<Record<string, string>[]>(
      (combos, [name, list]) => combos.flatMap((combo) => list.map((value) => ({ ...combo, [name]: value }))),
      [{}],
    )

    return await this.db.transaction(async (tx) => {
      const variantService = new ProductVariantService(tx)
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for('update')
      if (!product) {
        throw new NotFoundError(`Product not found: ${productId}`)
      }
      const existing = await variantService.list(productId)
      const key = (combo: Record<string, string>) =>
        Object.entries(combo).sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `${n}=${v}`).join('|')
      const existingKeys = new Set(
        existing.map((variant) => key(Object.fromEntries(variant.options.map((o) => [o.name, o.value])))),
      )
      const base = existing[0]
      let optionless = existing.length === 1 && !existing[0]!.options.length ? existing[0] : undefined
      const results = []
      for (const combo of combinations) {
        if (existingKeys.has(key(combo))) {
          continue
        }
        if (optionless) {
          results.push(await variantService.update(optionless.id, { options: combo }))
          optionless = undefined
          continue
        }
        const stem = [base?.sku ?? product.slug.toUpperCase(), ...Object.values(combo).map(skuPart)].join('-')
        let sku = stem
        for (let n = 2; (await tx.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku))).length; n++) {
          sku = `${stem}-${n}`
        }
        results.push(
          await variantService.create(productId, {
            sku,
            price: base?.price,
            discountedPrice: base?.discountedPrice,
            inventoryCost: base?.inventoryCost,
            stockQuantity: 0,
            options: combo,
          }),
        )
      }
      return results
    })
  }

  private async checkImage(productId: number, imageId?: number | null) {
    if (imageId === undefined || imageId === null) {
      return
    }
    const [image] = await this.db
      .select()
      .from(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
    if (!image) {
      throw new ValidationError(`Image does not belong to the product: ${imageId}`)
    }
  }

  // Links the variant to the given option values, creating the product's
  // options and values that do not exist yet. Two variants of a product
  // cannot have the same options.
  private async setOptions(
    variant: { id: number; productId: number },
    options: Record<string, string>,
  ) {
    const optionValueIds: number[] = []
    for (const [name, value] of Object.entries(options)) {
      await this.db
        .insert(productOptions)
        .values({ productId: variant.productId, name })
        .onConflictDoNothing()
      const [option] = await this.db
        .select()
        .from(productOptions)
        .where(
          and(
            eq(productOptions.productId, variant.productId),
            eq(productOptions.name, name),
          ),
        )
      await this.db
        .insert(productOptionValues)
        .values({ optionId: option.id, value })
        .onConflictDoNothing()
      const [optionValue] = await this.db
        .select()
        .from(productOptionValues)
        .where(
          and(
            eq(productOptionValues.optionId, option.id),
            eq(productOptionValues.value, value),
          ),
        )
      optionValueIds.push(optionValue.id)
    }

    const otherVariants = await this.db.query.productVariants.findMany({
      columns: { id: true },
      with: { optionValues: { columns: { optionValueId: true } } },
      where: and(
        eq(productVariants.productId, variant.productId),
        sql`${productVariants.id} <> ${variant.id}`,
      ),
    })
    const key = (ids: number[]) => [...ids].sort((a, b) => a - b).join(',')
    if (
      otherVariants.some(
        (other) =>
          key(other.optionValues.map((v) => v.optionValueId)) === key(optionValueIds),
      )
    ) {
      throw new ValidationError('A variant with these options already exists')
    }

    await this.db
      .delete(productVariantOptionValues)
      .where(eq(productVariantOptionValues.variantId, variant.id))
    if (optionValueIds.length) {
      await this.db.insert(productVariantOptionValues).values(
        optionValueIds.map((optionValueId) => ({
          variantId: variant.id,
          optionValueId,
        })),
      )
    }
  }
}

// Options are created through variants. Renaming or deleting them here does
// not change orders already placed, which keep their own copy.
class ProductOptionService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async list(productId: number) {
    return await this.db.query.productOptions.findMany({
      with: {
        values: { orderBy: asc(productOptionValues.id) },
      },
      where: eq(productOptions.productId, productId),
      orderBy: asc(productOptions.id),
    })
  }

  async rename(optionId: number, name: string) {
    const result = await this.db
      .update(productOptions)
      .set({ name })
      .where(eq(productOptions.id, optionId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product option not found: ${optionId}`)
    }
    return result[0]
  }

  // Also removes the option from every variant that uses it. Refused while
  // more than one of its values is used, as the variants would then be left
  // with the same options.
  async delete(optionId: number) {
    const [option] = await this.db
      .select()
      .from(productOptions)
      .where(eq(productOptions.id, optionId))
    if (!option) {
      throw new NotFoundError(`Product option not found: ${optionId}`)
    }
    const used = await this.db
      .selectDistinct({ id: productVariantOptionValues.optionValueId })
      .from(productVariantOptionValues)
      .innerJoin(productOptionValues, eq(productOptionValues.id, productVariantOptionValues.optionValueId))
      .where(eq(productOptionValues.optionId, optionId))
    if (used.length > 1) {
      throw new ValidationError(`${option.name} has more than one value in use; delete its values until one is left`)
    }
    const [result] = await this.db
      .delete(productOptions)
      .where(eq(productOptions.id, optionId))
      .returning()
    return result!
  }

  async renameValue(optionValueId: number, value: string) {
    const result = await this.db
      .update(productOptionValues)
      .set({ value })
      .where(eq(productOptionValues.id, optionValueId))
      .returning()
    if (!result[0]) {
      throw new NotFoundError(`Product option value not found: ${optionValueId}`)
    }
    return result[0]
  }

  // Also deletes the variants that use the value, all or none: a variant that
  // was ordered cannot be deleted (a foreign key error). Refused when it would
  // delete every variant of the product; delete the option then.
  async deleteValue(optionValueId: number) {
    return await this.db.transaction(async (tx) => {
      const [value] = await tx
        .select({ value: productOptionValues.value, productId: productOptions.productId })
        .from(productOptionValues)
        .innerJoin(productOptions, eq(productOptions.id, productOptionValues.optionId))
        .where(eq(productOptionValues.id, optionValueId))
      if (!value) {
        throw new NotFoundError(`Product option value not found: ${optionValueId}`)
      }
      const using = await tx
        .select({ id: productVariantOptionValues.variantId })
        .from(productVariantOptionValues)
        .where(eq(productVariantOptionValues.optionValueId, optionValueId))
      const variantIds = using.map((row) => row.id)
      if (variantIds.length) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(productVariants)
          .where(eq(productVariants.productId, value.productId))
        if (count <= variantIds.length) {
          throw new ValidationError(`Deleting ${value.value} would delete every variant; delete the option instead`)
        }
        await tx.delete(productVariants).where(inArray(productVariants.id, variantIds))
      }
      const [result] = await tx
        .delete(productOptionValues)
        .where(eq(productOptionValues.id, optionValueId))
        .returning()
      return result!
    })
  }
}

class RelatedProductService {
  private db: Database

  constructor(dbInstance: any) {
    this.db = dbInstance as Database
  }

  async setRelatedProducts(productId: number, relatedProductIds: number[]) {
    return await this.db.transaction(async (tx) => {
      await tx
        .delete(productRelatedProducts)
        .where(eq(productRelatedProducts.productId, productId))
      if (relatedProductIds.length) {
        await tx.insert(productRelatedProducts).values(
          relatedProductIds.map((relatedProductId) => ({
            productId,
            relatedProductId,
          })),
        )
      }
    })
  }
}

export {
  listedProduct,
  OutOfStockError,
  BrandService,
  CategoryService,
  ProductClassService,
  ProductImageService,
  ProductOptionService,
  ProductService,
  ProductVariantService,
  RelatedProductService,
  minVariantPrice,
  optionValuesWithOption,
  withVariantOptions,
}
