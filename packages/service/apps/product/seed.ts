import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { eq } from 'drizzle-orm'
import { db } from '../../core/db'
import { closeDb } from '../../core/db/pg/db'
import type { CustomField } from './schemas/pg'
import { products, productVariants } from './schemas/pg'
import { ProductService, ProductVariantService } from './services/product'

type SeedVariant = {
  sku: string
  price: string
  stockQuantity?: number
  options: Record<string, string>
}

type SeedProduct = {
  name: string
  slug: string
  description: string
  specification?: string
  status: 'Published'
  customFields?: CustomField[]
  variants: SeedVariant[]
}

const jerseySizes = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL']

const jerseyChart = [
  'Size chart, inches. Length is from the highest point of the shoulder.',
  'S: length 26, chest 36',
  'M: length 27, chest 38',
  'L: length 28, chest 40',
  'XL: length 29, chest 42',
  'XXL: length 30, chest 44',
  'XXXL: length 31, chest 46',
].join('\n')

const skuPart = (value: string) => value.trim().replace(/\s+/g, '-').toUpperCase()

const sizedVariants = (prefix: string, price: string, sizes: string[]): SeedVariant[] =>
  sizes.map((size) => ({
    sku: `${prefix}-${skuPart(size)}`,
    price,
    stockQuantity: 10,
    options: { Size: size },
  }))

// Bat price by size, plus the ball. Full size with a leather ball is 4215 + 850.
const batPrices: Record<string, number> = {
  'Full Size': 4215,
  'Size 6': 3615,
  'Size 5': 3615,
  'Size 4': 3515,
  'Size 3': 3515,
}
const ballPrices: Record<string, number> = { Leather: 850, Tennis: 205 }

const kitVariants: SeedVariant[] = Object.entries(batPrices).flatMap(([size, bat]) =>
  Object.entries(ballPrices).map(([ball, extra]) => ({
    sku: `CRICKET-KIT-${skuPart(size)}-${skuPart(ball)}`,
    price: String(bat + extra),
    stockQuantity: 10,
    options: { Size: size, Ball: ball },
  })),
)

const samples: SeedProduct[] = [
  {
    name: 'Test Product',
    slug: 'test-product',
    description: 'Test Description',
    status: 'Published',
    variants: [{ sku: 'TEST-PRODUCT', price: '100', options: {} }],
  },
  {
    name: 'Official Cricket Kit',
    slug: 'official-cricket-kit',
    description:
      'A cricket kit with a bat, a bat cover, and a choice of leather or tennis ball. The handle has a non-slip grip, and the bat is light and durable. Store it in a cool dry place, keep the bat in its cover when it is not in use, avoid moisture, and clean it with a soft dry cloth.',
    status: 'Published',
    variants: kitVariants,
  },
  {
    name: 'Signed Fundraiser Jersey',
    slug: 'signed-fundraiser-jersey',
    description:
      'More than a jersey, this one is signed. Part of each sale supports grassroots cricket in places the game has barely reached.',
    specification: jerseyChart,
    status: 'Published',
    variants: sizedVariants('SIGNED-JERSEY', '1649', jerseySizes),
  },
  {
    name: 'Customized Home Jersey',
    slug: 'customized-home-jersey',
    description:
      'A home jersey in bold colors and lightweight breathable fabric, for game days and casual wear. Add the name and number to print on it.',
    specification: jerseyChart,
    status: 'Published',
    customFields: [
      { label: 'Name', required: true, maxLength: 20 },
      { label: 'Number', required: true, maxLength: 3 },
    ],
    variants: sizedVariants('HOME-JERSEY', '1649', jerseySizes),
  },
]

// Inserts each sample, or returns the row already stored under its slug or
// SKU. A later run does not insert another row and does not change the first.
const ensureProduct = async (database: typeof db, sample: SeedProduct) => {
  const productService = new ProductService(database)
  const existing = await productService.getBySlug(sample.slug)
  if (existing) {
    console.log('Product already seeded:', existing.id, sample.slug)
    return existing
  }
  for (const variant of sample.variants) {
    const [found] = await database
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.sku, variant.sku))
    if (!found) {
      continue
    }
    const [product] = await database.select().from(products).where(eq(products.id, found.productId))
    if (!product) {
      throw new Error(`Variant ${variant.sku} has no product`)
    }
    console.log('Product already seeded:', product.id, sample.slug)
    return product
  }

  console.log('Seeding product...', sample.slug)
  const [first, ...rest] = sample.variants
  const created = await productService.create({
    name: sample.name,
    slug: sample.slug,
    description: sample.description,
    specification: sample.specification,
    status: sample.status,
    customFields: sample.customFields,
    sku: first.sku,
    price: first.price,
    stockQuantity: first.stockQuantity,
  })
  const variantService = new ProductVariantService(database)
  if (Object.keys(first.options).length) {
    await variantService.update(created.variants[0].id, { options: first.options })
  }
  for (const variant of rest) {
    await variantService.create(created.id, variant)
  }
  console.log('Product seeded:', created.id, sample.slug)
  return created
}

export const seedProduct = async (database = db) => {
  const seeded = []
  for (const sample of samples) {
    seeded.push(await ensureProduct(database, sample))
  }
  return seeded
}

const main = async () => {
  await seedProduct()
  await closeDb()
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main()
}
