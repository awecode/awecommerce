import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../../core/db'
import { closeDb } from '../../core/db/pg/db'
import { products, productVariants } from './schemas/pg'
import { ProductService } from './services/product'

// The sample the storefront can show. Identity is the slug, then the SKU.
const sample = {
  name: 'Test Product',
  slug: 'test-product',
  sku: 'TEST-PRODUCT',
  description: 'Test Description',
  price: '100',
  // Published, so the storefront shows it
  status: 'Published' as const,
}

// Inserts the sample product, or returns the one already stored under its slug
// or SKU. A second run does not insert another row and does not change the first.
export const seedProduct = async (database = db) => {
  const productService = new ProductService(database)
  const existing = await productService.getBySlug(sample.slug)
  if (existing) {
    console.log('Product already seeded:', existing.id)
    return existing
  }
  const [variant] = await database
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(eq(productVariants.sku, sample.sku))
  if (variant) {
    const [product] = await database
      .select()
      .from(products)
      .where(eq(products.id, variant.productId))
    if (!product) {
      throw new Error(`Variant ${sample.sku} has no product`)
    }
    console.log('Product already seeded:', product.id)
    return product
  }
  console.log('Seeding product...')
  const product = await productService.create(sample)
  console.log('Product seeded:', product.id)
  return product
}

const main = async () => {
  await seedProduct()
  await closeDb()
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main()
}
