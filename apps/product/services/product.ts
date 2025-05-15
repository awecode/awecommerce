import {
  and,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  SQL,
  sql,
} from 'drizzle-orm'

import {
  brands,
  categories,
  NewBrand,
  NewCategory,
  NewProduct,
  NewProductClass,
  Product,
  productClasses,
  productImages,
  productRelatedProducts,
  products,
  productViews,
} from '../schemas'
import { orderLines } from '../../order/schemas'
import { aliasedTable } from 'drizzle-orm'

type PaginationArgs = {
  page: number
  size: number
}

interface ProductFilter {
  brands?: number[]
  categories?: number[]
  subCategories?: number[]
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

class ProductService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async create(product: NewProduct) {
    const { images, relatedProducts, ...productData } = product
    const result = await this.db
      .insert(products)
      .values(productData)
      .returning()
    if (images) {
      const productImageService = new ProductImageService(this.db)
      await productImageService.setImages(result[0].id, images)
    }
    if (relatedProducts) {
      const relatedProductService = new RelatedProductService(this.db)
      await relatedProductService.setRelatedProducts(
        result[0].id,
        relatedProducts,
      )
    }
    return result[0]
  }

  async get(productId: number) {
    const result = await this.db.query.products.findFirst({
      with: {
        relatedProducts: {
          with: {
            relatedProduct: {
              with: {
                category: true,
                subCategory: true,
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
        subCategory: {
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

  async getPrices(productId: number) {
    const result = await this.db
      .select({
        price: products.price,
        discountedPrice: products.discountedPrice,
      })
      .from(products)
      .where(eq(products.id, productId))
    return result[0]
  }

  async update(productId: number, product: Partial<NewProduct>) {
    const { images, relatedProducts, ...productData } = product
    const result = await this.db
      .update(products)
      .set({
        ...productData,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .returning()
    if (images) {
      const productImageService = new ProductImageService(this.db)
      await productImageService.setImages(productId, images)
    }
    if (relatedProducts) {
      const relatedProductService = new RelatedProductService(this.db)
      await relatedProductService.setRelatedProducts(productId, relatedProducts)
    }
    return result[0]
  }

  async delete(productId: number) {
    const result = await this.db
      .delete(products)
      .where(eq(products.id, productId))
      .returning()
    return result[0]
  }

  async list(filter: ProductFilter) {
    const where: SQL[] = []

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
          or(
            ...filter.categories.map((categoryId) =>
              or(
                eq(products.categoryId, categoryId),
                eq(products.subCategoryId, categoryId),
              ),
            ),
          )!,
        )
      }
      if(filter.subCategories && filter.subCategories.length) {
        where.push(
          or(
            ...filter.subCategories.map((subCategoryId) =>
              eq(products.subCategoryId, subCategoryId),
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

      if (!filter.includeInactiveCategories) {
        where.push(
          or(isNull(products.categoryId), eq(categories.isActive, true))!,
        )
        where.push(
          or(isNull(products.subCategoryId), eq(categories.isActive, true))!,
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
        where.push(
          sql`COALESCE(${products.discountedPrice}, ${products.price}) >= ${filter.minPrice}`,
        )
      }

      if (filter.maxPrice) {
        where.push(
          sql`COALESCE(${products.discountedPrice}, ${products.price}) <= ${filter.maxPrice}`,
        )
      }

      if (filter.extraFilters) {
        where.push(...filter.extraFilters)
      }
    }

    let orderBy: SQL | undefined
    if (filter.sortBy) {
      if (filter.sortBy === 'priceAsc') {
        orderBy = sql`COALESCE(${products.discountedPrice}, ${products.price})`
      } else {
        orderBy = desc(
          sql`COALESCE(${products.discountedPrice}, ${products.price})`,
        )
      }
    } else {
      orderBy = desc(products.createdAt)
    }

    const subCategories = aliasedTable(categories, 'sub_categories')

    let query = this.db
      .select({
        ...products,
        brand: brands,
        category: categories,
        productClass: productClasses,
        subCategory: subCategories,
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(subCategories, eq(products.subCategoryId, subCategories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .orderBy(orderBy)
      .where(and(...where))

    if (!filter.pagination) {
      return await query
    }

    const { page, size } = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = Number(
      (
        await this.db
          .select({ count: sql<number>`count(*)` })
          .from(products)
          .leftJoin(brands, eq(products.brandId, brands.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .leftJoin(subCategories, eq(products.subCategoryId, subCategories.id))
          .leftJoin(
            productClasses,
            eq(products.productClassId, productClasses.id),
          )
          .where(and(...where))
      )[0]!.count,
    )
    return {
      results: results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
    const subCategories = aliasedTable(categories, 'sub_categories')
    return await this.db
      .select({
        ...getTableColumns(products),
        category: getTableColumns(categories),
        brand: getTableColumns(brands),
        productClass: getTableColumns(productClasses),
        subCategory: getTableColumns(subCategories),
      })
      .from(
        this.db
          .selectDistinctOn([productViews.productId], {
            productId: productViews.productId,
            createdAt: productViews.createdAt,
          })
          .from(productViews)
          .leftJoin(products, eq(productViews.productId, products.id))
          .where(and(eq(productViews.userId, userId)))
          .orderBy(productViews.productId, desc(productViews.createdAt))
          .as('latest_views'),
      )
      .leftJoin(products, sql`latest_views.product_id = ${products.id}`)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(subCategories, eq(products.subCategoryId, subCategories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .where(
        and(
          eq(products.isActive, true),
          or(isNull(products.brandId), eq(brands.isActive, true)),
          or(isNull(products.categoryId), eq(categories.isActive, true)),
          or(isNull(products.subCategoryId), eq(subCategories.isActive, true)),
          or(
            isNull(products.productClassId),
            eq(productClasses.isActive, true),
          ),
        ),
      )
      .orderBy(desc(sql`latest_views.created_at`))
      .limit(4)
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
  pagination?: PaginationArgs
}
class BrandService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
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

  async list(filter: BrandFilter) {
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

    const query = this.db
      .select()
      .from(brands)
      .where(and(...where))
      .orderBy(desc(brands.createdAt))

    if (!filter.pagination) {
      return await query
    }

    const { page, size } = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = await this.db.$count(brands, and(...where))
    return {
      results: results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
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

  async list(filter?: ProductClassFilter) {
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

    if (!filter?.pagination) {
      return await query
    }

    const { page, size } = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = await this.db.$count(productClasses, and(...where))
    return {
      results: results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
  parent?: number[]
  isRootCategory?: boolean
  pagination?: PaginationArgs
}

class CategoryService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
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
      or(
        eq(products.categoryId, categoryId),
        eq(products.subCategoryId, categoryId),
      ),
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

  async list(filter?: CategoryFilter) {
    const where: SQL[] = []

    if (filter?.q) {
      where.push(
        or(
          Number(filter.q) ? eq(categories.id, Number(filter.q)) : undefined,
          ilike(categories.name, `%${filter.q}%`),
        )!,
      )
    }

    if (filter?.isRootCategory !== undefined) {
      if (filter.isRootCategory) {
        where.push(isNull(categories.parentId))
      } else {
        where.push(isNotNull(categories.parentId))
      }
    }

    if (filter?.parent && filter.parent.length) {
      where.push(
        or(
          ...filter.parent.map((parentId) => eq(categories.parentId, parentId)),
        )!,
      )
    }

    if (filter?.isActive !== undefined) {
      where.push(eq(categories.isActive, filter.isActive))
    }

    const parentCategories = aliasedTable(categories, 'parent_categories')

    const query = this.db
      .select({
        ...getTableColumns(categories),
        parent: getTableColumns(parentCategories),
      })
      .from(categories)
      .leftJoin(parentCategories, eq(parentCategories.id, categories.parentId))
      .where(and(...where))
      .orderBy(desc(categories.createdAt))

    if (!filter?.pagination) {
      return await query
    }

    const { page, size } = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = await this.db.$count(categories, and(...where))
    return {
      results: results,
      pagination: {
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      },
    }
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
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async getImages(productId: number) {
    const result = await this.db
      .select()
      .from(productImages)
      .where(eq(productImages.productId, productId))
    return result
  }

  async setImages(productId: number, imageUrls: string[]) {
    const result = await this.db
      .delete(productImages)
      .where(eq(productImages.productId, productId))
    if (imageUrls.length) {
      await this.db
        .insert(productImages)
        .values(imageUrls.map((imageUrl) => ({ productId, imageUrl })))
    }
    return result
  }
}

class RelatedProductService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async setRelatedProducts(productId: number, relatedProductIds: number[]) {
    await this.db
      .delete(productRelatedProducts)
      .where(eq(productRelatedProducts.productId, productId))
    if (relatedProductIds.length) {
      await this.db.insert(productRelatedProducts).values(
        relatedProductIds.map((relatedProductId) => ({
          productId,
          relatedProductId,
        })),
      )
    }
  }
}

export {
  BrandService,
  CategoryService,
  ProductClassService,
  ProductImageService,
  ProductService,
  RelatedProductService,
}
