// Which products a range covers
import { expect, test } from 'vitest'

import { db } from 'core/db'
import { OfferRangeService, OfferService } from 'apps/offer/services/offer'
import { BrandService, CategoryService, ProductService } from 'apps/product/services/product'

let count = 0
const unique = (name: string) => `${name}-${++count}`
const offerService = new OfferService(db)

const product = async (fields: { brandId?: number; categoryId?: number } = {}) => {
  const slug = unique('range-product')
  return await new ProductService(db).create({ name: slug, slug, sku: slug, price: '10', stockQuantity: 1, ...fields })
}

test('a range of any of the chosen lists leaves out every exception, whichever list it is on', async () => {
  const shirts = await new CategoryService(db).create({ name: unique('Shirts'), slug: unique('shirts') })
  const acme = await new BrandService(db).create({ name: unique('Acme'), slug: unique('acme') })
  const other = await new BrandService(db).create({ name: unique('Other'), slug: unique('other') })
  const plainShirt = await product({ categoryId: shirts.id, brandId: other.id })
  const acmeShirt = await product({ categoryId: shirts.id, brandId: acme.id })
  const chosen = await product()
  const range = await new OfferRangeService(db).create({
    name: unique('range'),
    inclusiveFilter: false,
    includedCategories: [shirts.id],
    includedProducts: [chosen.id],
    excludedBrands: [acme.id],
  })

  const inRange = await offerService.getProductIdsInOfferRange(range.id, [plainShirt.id, acmeShirt.id, chosen.id])
  expect(inRange.sort()).toEqual([plainShirt.id, chosen.id].sort())
})

test('a range of every product leaves out its exceptions', async () => {
  const acme = await new BrandService(db).create({ name: unique('Acme'), slug: unique('acme') })
  const acmeThing = await product({ brandId: acme.id })
  const unbranded = await product()
  const range = await new OfferRangeService(db).create({
    name: unique('range'),
    inclusiveFilter: true,
    includeAllProducts: true,
    includeAllBrands: true,
    includeAllCategories: true,
    includeAllProductClasses: true,
    excludedBrands: [acme.id],
  })
  expect(await offerService.getProductIdsInOfferRange(range.id, [acmeThing.id, unbranded.id])).toEqual([unbranded.id])
})

test('a category covers its subcategories, at any depth, chosen or excepted', async () => {
  const categoryService = new CategoryService(db)
  const clothing = await categoryService.create({ name: unique('Clothing'), slug: unique('clothing') })
  const shirts = await categoryService.create({ name: unique('Shirts'), slug: unique('shirts'), parentId: clothing.id })
  const sale = await categoryService.create({ name: unique('Sale'), slug: unique('sale'), parentId: shirts.id })
  const shoes = await categoryService.create({ name: unique('Shoes'), slug: unique('shoes') })
  const jacket = await product({ categoryId: clothing.id })
  const shirt = await product({ categoryId: shirts.id })
  const saleShirt = await product({ categoryId: sale.id })
  const boot = await product({ categoryId: shoes.id })
  const ids = [jacket.id, shirt.id, saleShirt.id, boot.id]

  const chosen = await new OfferRangeService(db).create({
    name: unique('range'),
    inclusiveFilter: false,
    includedCategories: [clothing.id],
    excludedCategories: [sale.id],
  })
  expect((await offerService.getProductIdsInOfferRange(chosen.id, ids)).sort()).toEqual([jacket.id, shirt.id].sort())

  const everything = await new OfferRangeService(db).create({
    name: unique('range'),
    inclusiveFilter: true,
    includeAllProducts: true,
    includeAllBrands: true,
    includeAllCategories: true,
    includeAllProductClasses: true,
    excludedCategories: [shirts.id],
  })
  expect((await offerService.getProductIdsInOfferRange(everything.id, ids)).sort()).toEqual([jacket.id, boot.id].sort())
})
