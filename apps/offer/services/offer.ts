import { eq } from 'drizzle-orm'
import {
  NewOfferRange,
  offerRanges,
  offerRangeExcludedProducts,
  offerRangeIncludedProducts,
  offerRangeIncludedBrands,
  offerRangeIncludedCategories,
  offerRangeIncludedProductClasses,
  UpdateOfferRange,
  NewOfferBenefit,
  offerBenefits,
  UpdateOfferBenefit,
  offerConditions,
  offers,
  offerApplicationLogs,
  NewOfferApplicationLog,
  UpdateOfferApplicationLog,
} from '../schemas'

class OfferRangeService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: NewOfferRange) {
    const [offerRange] = await this.db
      .insert(offerRanges)
      .values(data)
      .returning()
    if (data.includedProducts) {
      await this.db.insert(offerRangeIncludedProducts).values(
        data.includedProducts.map((productId) => ({
          rangeId: offerRange.id,
          productId,
        })),
      )
    }
    if (data.excludedProducts) {
      await this.db.insert(offerRangeExcludedProducts).values(
        data.excludedProducts.map((productId) => ({
          rangeId: offerRange.id,
          productId,
        })),
      )
    }
    if (data.includedCategories) {
      await this.db.insert(offerRangeIncludedCategories).values(
        data.includedCategories.map((categoryId) => ({
          rangeId: offerRange.id,
          categoryId,
        })),
      )
    }
    if (data.includedBrands) {
      await this.db.insert(offerRangeIncludedBrands).values(data.includedBrands)
    }
    if (data.includedProductClasses) {
      await this.db.insert(offerRangeIncludedProductClasses).values(
        data.includedProductClasses.map((productClassId) => ({
          rangeId: offerRange.id,
          productClassId,
        })),
      )
    }
  }

  async getById(id: number) {
    const offer = await this.db.query.offerRanges.findFirst({
      where: eq(offerRanges.id, id),
      with: {
        includedProducts: {
          with: {
            product: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        excludedProducts: {
          with: {
            product: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedCategories: {
          with: {
            category: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedBrands: {
          with: {
            brand: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
        includedProductClasses: {
          with: {
            productClass: {
              columns: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })
    if (!offer) {
      return offer
    }
    return {
      ...offer,
      includedProducts: offer.includedProducts.map((p: any) => p.product),
      excludedProducts: offer.excludedProducts.map((p: any) => p.product),
      includedCategories: offer.includedCategories.map((c: any) => c.category),
      includedBrands: offer.includedBrands.map((b: any) => b.brand),
      includedProductClasses: offer.includedProductClasses.map(
        (pc: any) => pc.productClass,
      ),
    }
  }

  async update(id: number, data: UpdateOfferRange) {
    const [offerRange] = await this.db
      .update(offerRanges)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerRanges.id, id))
      .returning()
    if (data.includedProducts) {
      await this.db
        .delete()
        .from(offerRangeIncludedProducts)
        .where(eq(offerRangeIncludedProducts.rangeId, id))
      if (data.includedProducts.length > 0) {
        await this.db.insert(offerRangeIncludedProducts).values(
          data.includedProducts.map((productId) => ({
            rangeId: id,
            productId,
          })),
        )
      }
    }
    if (data.excludedProducts) {
      await this.db
        .delete()
        .from(offerRangeExcludedProducts)
        .where(eq(offerRangeExcludedProducts.rangeId, id))
      if (data.excludedProducts.length > 0) {
        await this.db.insert(offerRangeExcludedProducts).values(
          data.excludedProducts.map((productId) => ({
            rangeId: id,
            productId,
          })),
        )
      }
    }
    if (data.includedCategories) {
      await this.db
        .delete()
        .from(offerRangeIncludedCategories)
        .where(eq(offerRangeIncludedCategories.rangeId, id))
      if (data.includedCategories.length > 0) {
        await this.db.insert(offerRangeIncludedCategories).values(
          data.includedCategories.map((categoryId) => ({
            rangeId: id,
            categoryId,
          })),
        )
      }
    }
    if (data.includedBrands) {
      await this.db
        .delete()
        .from(offerRangeIncludedBrands)
        .where(eq(offerRangeIncludedBrands.rangeId, id))
      if (data.includedBrands.length > 0) {
        await this.db.insert(offerRangeIncludedBrands).values(
          data.includedBrands.map((brandId) => ({
            rangeId: id,
            brandId,
          })),
        )
      }
    }
    if (data.includedProductClasses) {
      await this.db
        .delete()
        .from(offerRangeIncludedProductClasses)
        .where(eq(offerRangeIncludedProductClasses.rangeId, id))
      if (data.includedProductClasses.length > 0) {
        await this.db.insert(offerRangeIncludedProductClasses).values(
          data.includedProductClasses.map((productClassId) => ({
            rangeId: id,
            productClassId,
          })),
        )
      }
    }
    return offerRange
  }

  async delete(id: number) {
    return await this.db
      .delete()
      .from(offerRanges)
      .where(eq(offerRanges.id, id))
  }
}

class OfferBenefitService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: NewOfferBenefit) {
    const [offerBenefit] = await this.db
      .insert(offerBenefits)
      .values(data)
      .returning()
    return offerBenefit
  }

  async getById(id: number) {
    return await this.db.query.offerBenefits.findFirst({
      where: eq(offerBenefits.id, id),
    })
  }

  async update(id: number, data: UpdateOfferBenefit) {
    return await this.db
      .update(offerBenefits)
      .set({
        ...data,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(offerBenefits.id, id))
  }

  async delete(id: number) {
    return await this.db
      .delete()
      .from(offerBenefits)
      .where(eq(offerBenefits.id, id))
  }
}

class OfferConditionService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: { rangeId: number; type: string; value: number }) {
    const [offerCondition] = await this.db
      .insert(offerConditions)
      .values(data)
      .returning()
    return offerCondition
  }

  async getById(id: number) {
    return await this.db.query.offerConditions.findFirst({
      where: eq(offerConditions.id, id),
    })
  }

  async update(id: number, data: { type?: string; value?: number }) {
    return await this.db
      .update(offerConditions)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerConditions.id, id))
  }

  async delete(id: number) {
    return await this.db
      .delete()
      .from(offerConditions)
      .where(eq(offerConditions.id, id))
  }
}

class OfferService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: any) {
    const [offer] = await this.db.insert(offers).values(data).returning()
    return offer
  }

  async getById(id: number) {
    return await this.db.query.offers.findFirst({
      where: eq(offers.id, id),
    })
  }

  async update(id: number, data: any) {
    return await this.db
      .update(offers)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offers.id, id))
  }

  async delete(id: number) {
    return await this.db.delete().from(offers).where(eq(offers.id, id))
  }
}

class OfferApplicationLogService {
  private db: any

  constructor(db: any) {
    this.db = db
  }

  async create(data: NewOfferApplicationLog) {
    const [log] = await this.db
      .insert(offerApplicationLogs)
      .values(data)
      .returning()
    return log
  }

  async getById(id: number) {
    return await this.db.query.offerApplicationLogs.findFirst({
      where: eq(offerApplicationLogs.id, id),
    })
  }

  async update(id: number, data: UpdateOfferApplicationLog) {
    return await this.db
      .update(offerApplicationLogs)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(offerApplicationLogs.id, id))
  }

  async delete(id: number) {
    return await this.db
      .delete()
      .from(offerApplicationLogs)
      .where(eq(offerApplicationLogs.id, id))
  }
}

export {
  OfferRangeService,
  OfferBenefitService,
  OfferConditionService,
  OfferService,
  OfferApplicationLogService,
}
