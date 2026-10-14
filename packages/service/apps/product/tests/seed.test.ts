import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { products, productVariants } from '../schemas/pg'
import { seedProduct } from '../seed'

const variantsFor = (productId: number) =>
  db.select().from(productVariants).where(eq(productVariants.productId, productId))

test('seedProduct inserts each sample once and keeps those rows on later runs', async () => {
  const first = await seedProduct(db)
  const second = await seedProduct(db)
  const sample = first.find((product) => product.slug === 'test-product')!
  const again = second.find((product) => product.id === sample.id)!

  expect(again.id).toBe(sample.id)
  expect(sample.name).toBe('Test Product')
  expect(sample.status).toBe('Published')
  expect(await db.select().from(products).where(eq(products.slug, 'test-product'))).toHaveLength(1)
  const sampleVariants = await variantsFor(sample.id)
  expect(sampleVariants.map((variant) => [variant.sku, Number(variant.price)])).toEqual([['TEST-PRODUCT', 100]])

  const kit = first.find((product) => product.slug === 'official-cricket-kit')!
  const kitVariants = await variantsFor(kit.id)
  expect(kitVariants).toHaveLength(10)
  const fullLeather = kitVariants.find((variant) => variant.sku === 'CRICKET-KIT-FULL-SIZE-LEATHER')
  const size3Tennis = kitVariants.find((variant) => variant.sku === 'CRICKET-KIT-SIZE-3-TENNIS')
  expect(Number(fullLeather?.price)).toBe(5065)
  expect(Number(size3Tennis?.price)).toBe(3720)

  const signed = first.find((product) => product.slug === 'signed-fundraiser-jersey')!
  expect(await variantsFor(signed.id)).toHaveLength(6)
  expect(signed.customFields).toEqual([])

  const home = first.find((product) => product.slug === 'customized-home-jersey')!
  expect(home.customFields).toEqual([
    { label: 'Name', required: true, maxLength: 20 },
    { label: 'Number', required: true, maxLength: 3 },
  ])
  expect(await variantsFor(home.id)).toHaveLength(6)

  expect(second).toHaveLength(first.length)
  expect(await variantsFor(kit.id)).toHaveLength(10)
  expect(await variantsFor(home.id)).toHaveLength(6)

  // The slug can change in the backoffice. The SKU still identifies the sample,
  // so a later run does not insert a second product.
  await db.update(products).set({ slug: 'renamed-test-product' }).where(eq(products.id, sample.id))
  const third = await seedProduct(db)

  expect(third.find((product) => product.id === sample.id)?.id).toBe(sample.id)
  expect(await db.select().from(products).where(eq(products.slug, 'test-product'))).toHaveLength(0)
  expect(await db.select().from(productVariants).where(eq(productVariants.sku, 'TEST-PRODUCT'))).toHaveLength(1)
  expect(await db.select().from(products).where(eq(products.slug, 'official-cricket-kit'))).toHaveLength(1)
})
