import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { products, productVariants } from '../schemas/pg'
import { seedProduct } from '../seed'

test('seedProduct inserts the sample once and keeps that row on later runs', async () => {
  const first = await seedProduct(db)
  const second = await seedProduct(db)

  expect(second.id).toBe(first.id)
  expect(first.name).toBe('Test Product')
  expect(first.status).toBe('Published')

  const rows = await db.select().from(products).where(eq(products.slug, 'test-product'))
  expect(rows).toHaveLength(1)
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.sku, 'TEST-PRODUCT'))
  expect(variants).toHaveLength(1)
  expect(Number(variants[0].price)).toBe(100)

  // The slug can change in the backoffice. The SKU still identifies the sample,
  // so a later run does not insert a second product.
  await db.update(products).set({ slug: 'renamed-test-product' }).where(eq(products.id, first.id))
  const third = await seedProduct(db)

  expect(third.id).toBe(first.id)
  expect(await db.select().from(products).where(eq(products.slug, 'test-product'))).toHaveLength(0)
  expect(await db.select().from(productVariants).where(eq(productVariants.sku, 'TEST-PRODUCT'))).toHaveLength(1)
})
