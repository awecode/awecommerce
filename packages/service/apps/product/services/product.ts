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
  sortBy?: 'priceAsc' | 'priceDesc'
  getFilters?: () => SQL[]
}

// The lowest selling price among the product's active variants
const minVariantPrice = sql<string | null>`(
  SELECT MIN(COALESCE(${productVariants.discountedPrice}, ${productVariants.price}))
  FROM ${productVariants}
  WHERE ${productVariants.productId} = ${products.id}
  AND ${productVariants.isActive} = true
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

  async delete(productId: number) {
    const result = await this.db
      .delete(products)
      .where(eq(products.id, productId))
      .returning()
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

    let orderBy: SQL | undefined
    if (filter.sortBy) {
      if (filter.sortBy === 'priceAsc') {
        orderBy = sql`${minVariantPrice}`
      } else {
        orderBy = desc(minVariantPrice)
      }
    } else {
      orderBy = desc(products.id)
    }

    let query = this.db
      .select({
        ...getTableColumns(products),
        minPrice: minVariantPrice,
        brand: getTableColumns(brands),
        category: getTableColumns(categories),
        productClass: getTableColumns(productClasses),
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .orderBy(orderBy)
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
    return result[0]
  }

  async unmarkAsFeatured(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isFeatured: false })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async markAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: true })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async unmarkAsBestSeller(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isBestSeller: false })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async markAsActive(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isActive: true })
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async markAsInactive(productId: number) {
    const result = await this.db
      .update(products)
      .set({ isActive: false })
      .where(eq(products.id, productId))
      .returning()
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
    return result[0]
  }

  async delete(brandId: number) {
    const result = await this.db
      .delete(brands)
      .where(eq(brands.id, brandId))
      .returning()
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
    return result[0]
  }

  async markAsInactive(brandId: number) {
    const result = await this.db
      .update(brands)
      .set({ isActive: false })
      .where(eq(brands.id, brandId))
      .returning()
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
    return result[0]
  }

  async delete(productClassId: number) {
    const result = await this.db
      .delete(productClasses)
      .where(eq(productClasses.id, productClassId))
      .returning()
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
    return result[0]
  }

  async markAsInactive(productClassId: number) {
    const result = await this.db
      .update(productClasses)
      .set({ isActive: false })
      .where(eq(productClasses.id, productClassId))
      .returning()
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
    const result = await this.db
      .update(categories)
      .set({
        ...category,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(categories.id, categoryId))
      .returning()
    return result[0]
  }

  async delete(categoryId: number) {
    const result = await this.db
      .delete(categories)
      .where(eq(categories.id, categoryId))
      .returning()
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
    return result[0]
  }

  async markAsInactive(categoryId: number) {
    const result = await this.db
      .update(categories)
      .set({ isActive: false })
      .where(eq(categories.id, categoryId))
      .returning()
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
    return result[0]
  }

  async markAsActive(variantId: number) {
    return await this.update(variantId, { isActive: true })
  }

  async markAsInactive(variantId: number) {
    return await this.update(variantId, { isActive: false })
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
    return result[0]
  }

  // Also removes the option from every variant that uses it
  async delete(optionId: number) {
    const result = await this.db
      .delete(productOptions)
      .where(eq(productOptions.id, optionId))
      .returning()
    return result[0]
  }

  async renameValue(optionValueId: number, value: string) {
    const result = await this.db
      .update(productOptionValues)
      .set({ value })
      .where(eq(productOptionValues.id, optionValueId))
      .returning()
    return result[0]
  }

  // Also removes the value from every variant that uses it
  async deleteValue(optionValueId: number) {
    const result = await this.db
      .delete(productOptionValues)
      .where(eq(productOptionValues.id, optionValueId))
      .returning()
    return result[0]
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
