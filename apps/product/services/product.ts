import { and, eq, like, or, SQL } from 'drizzle-orm'

import { brands, categories, NewBrand, NewCategory, NewProduct, NewProductClass, Product, productClasses, productImages, products } from '../schemas'

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
}


class ProductService {
  private db:any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }

  async create(product: NewProduct) {
    const result = await this.db.insert(products).values(product).returning()
    if(product.images){
      const productImageService = new ProductImageService(this.db)
      await productImageService.setImages(result[0].id, product.images)
    }
    if(product.relatedProducts){
      const relatedProductService = new RelatedProductService(this.db)
      await relatedProductService.setRelatedProducts(result[0].id, product.relatedProducts)
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
          like(products.id, `%${filter.q}%`),
          like(products.name, `%${filter.q}%`),
        )!,
      )
    }

    const query = this.db
      .select()
      .from(products)
      .where(and(...where))

    if (!filter.pagination) {
      return await query
    }

    const { page, size} = filter.pagination
    const results = await query.limit(size).offset((page - 1) * size)
    const total = await this.db.$count(products, and(...where))
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
}

interface BrandFilter {
  q?: string
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
      where.push(like(brands.name, `%${filter.q}%`))
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
}

interface ProductClassFilter {
  q?: string
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
      where.push(like(productClasses.name, `%${filter.q}%`))
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
}


interface CategoryFilter {
  q?: string
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
      where.push(like(categories.name, `%${filter.q}%`))
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
    await this.db.insert(productImages).values(imageUrls.map((imageUrl) => ({ productId, imageUrl })))
    return result
  }
}

class RelatedProductService {
  private db: any

  constructor(dbInstance: any) {
    this.db = dbInstance
  }
  
  async setRelatedProducts(productId: number, relatedProductIds: number[]) {
    await this.db.delete(products).where(eq(products.id, productId))
    await this.db.insert(products).values(relatedProductIds.map((relatedProductId) => ({ productId, relatedProductId })))
  }
}

export { BrandService, CategoryService, ProductClassService, ProductImageService, ProductService, RelatedProductService }

