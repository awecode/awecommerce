import { and, eq, ilike, or, SQL, sql, isNull } from 'drizzle-orm'

import { brands, categories, NewBrand, NewCategory, NewProduct, NewProductClass, Product, productClasses, productImages, productRelatedProducts, products } from '../schemas'

type PaginationArgs = {
  page: number
  size: number
}

interface ProductFilter {
  brand?: number
  category?: number
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
}

class ProductService {
  private db:any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async create(product: NewProduct) {
    const { images, relatedProducts, ...productData } = product
    const result = await this.db.insert(products).values(productData).returning()
    if(images){
      const productImageService = new ProductImageService(this.db)
      await productImageService.setImages(result[0].id, images)
    }
    if(relatedProducts){
      const relatedProductService = new RelatedProductService(this.db)
      await relatedProductService.setRelatedProducts(result[0].id, relatedProducts)
    }
    return result[0]
  }

  async get(productId: number) {
    const result = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
    return result[0]
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
    const result = await this.db
      .update(products)
      .set({
        ...product,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .returning()
    if(product.images){
      const productImageService = new ProductImageService(this.db)
      await productImageService.setImages(productId, product.images)
    }
    if(product.relatedProducts){
      const relatedProductService = new RelatedProductService(this.db)
      await relatedProductService.setRelatedProducts(productId, product.relatedProducts)
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

    if (filter.brand) {
      where.push(eq(products.brandId, filter.brand))
    }
    if (filter.category) {
      where.push(eq(products.categoryId, filter.category))
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
    if (filter.q) {
      where.push(
        or(
          Number(filter.q) ? eq(products.id, Number(filter.q)) : undefined,
          ilike(products.name, `%${filter.q}%`),
        )!,
      )
    }

    if(filter.isActive !== undefined){
      where.push(eq(products.isActive, filter.isActive))
    }

    if(!filter.includeInactiveBrands){
      where.push(or(isNull(products.brandId), eq(brands.isActive, true)))
    }

    if(!filter.includeInactiveCategories){
      where.push(or(isNull(products.categoryId), eq(categories.isActive, true)))
    }

    if(!filter.includeInactiveProductClasses){
      where.push(or(isNull(products.productClassId), eq(productClasses.isActive, true)))
    }

    let query = this.db
      .select({
        ...products,
        brand: brands,
        category: categories,
        productClass: productClasses
      })
      .from(products)
      .leftJoin(brands, eq(products.brandId, brands.id))
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
      .where(and(...where))

    if (!filter.pagination) {
      return await query
    }

    const { page, size} = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = Number((
      await this.db.select({ count: sql<number>`count(*)` }).from(products).
        leftJoin(brands, eq(products.brandId, brands.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(productClasses, eq(products.productClassId, productClasses.id))
        .where(and(...where))
      )[0]!.count)
    return {
      results: results,
      pagination:{
        page,
        size,
        total,
        pages: Math.ceil(total / size),
      }

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
}

interface BrandFilter {
  q?: string
  isActive?: boolean
  pagination?: PaginationArgs
}
class BrandService {
  private db:any

  constructor(dbInstance:any) {
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

    if(filter.isActive !== undefined){
      where.push(eq(brands.isActive, filter.isActive))
    }

    const query = this.db
      .select()
      .from(brands)
      .where(and(...where))

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
      }
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
    const result = await this.db.insert(productClasses).values(productClass).returning()
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

  async list(filter?: ProductClassFilter) {
    const where: SQL[] = []

    if (filter?.q) {
      where.push(
        or(
          Number(filter.q) ? eq(productClasses.id, Number(filter.q)) : undefined,
          ilike(productClasses.name, `%${filter.q}%`),
        )!,
      )
    }

    if(filter?.isActive !== undefined){
      where.push(eq(productClasses.isActive, filter.isActive))
    }

    const query = this.db
      .select()
      .from(productClasses)
      .where(and(...where))

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
      }
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

    if(filter?.isActive !== undefined){
      where.push(eq(categories.isActive, filter.isActive))
    }

    const query = this.db
      .select()
      .from(categories)
      .where(and(...where))

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
      }
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
    if(imageUrls.length) {
      await this.db.insert(productImages).values(imageUrls.map((imageUrl) => ({ productId, imageUrl })))
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
    await this.db.delete(productRelatedProducts).where(eq(productRelatedProducts.productId, productId))
    if(relatedProductIds.length){
      await this.db.insert(productRelatedProducts).values(relatedProductIds.map((relatedProductId) => ({ productId, relatedProductId })))
    }
  }
}

export { BrandService, CategoryService, ProductClassService, ProductImageService, ProductService, RelatedProductService }
