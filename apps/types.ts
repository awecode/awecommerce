import { Cart, CartLine } from './cart/schemas'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as cartSchemas from './cart/schemas'
import * as offerSchemas from './offer/schemas'
import * as orderSchemas from './order/schemas'
import * as productSchemas from './product/schemas'
import * as loyaltySchemas from './loyalty/schemas'

const tables = {
  ...cartSchemas,
  ...offerSchemas,
  ...orderSchemas,
  ...productSchemas,
  ...loyaltySchemas,
}

type BenefitType = 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'

type OfferDiscount = {
  id: number
  discount: number
  name: string
  benefitType: BenefitType
  benefitValue: number
}

type VoucherOfferDiscount = OfferDiscount & {
  voucherCode: string
}

export type CartContent = Cart & {
  lines: Array<
    CartLine & {
      product: {
        stockQuantity: number | null
        price: string | null
        discountedPrice: string | null
      }
      userOfferDiscounts: OfferDiscount[]
      voucherOfferDiscounts: VoucherOfferDiscount[]
      totalOfferDiscount: number
    }
  >
  userOfferDiscounts: OfferDiscount[]
  voucherOfferDiscounts: VoucherOfferDiscount[]
  totalOfferDiscount: number
}

export type CartContentWithoutOfferInfo = Cart & {
  lines: Array<
    CartLine & {
      product: {
        stockQuantity: number | null
        price: string | null
        discountedPrice: string | null
      }
    }
  >
}



export type Database = 
   NodePgDatabase<typeof tables> 
