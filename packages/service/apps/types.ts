import { Cart, CartLine } from './cart/schemas'
import { Product, ProductImage, ProductVariant } from './product/schemas'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as cartSchemas from './cart/schemas'
import * as offerSchemas from './offer/schemas'
import * as orderSchemas from './order/schemas'
import * as productSchemas from './product/schemas'
import * as loyaltySchemas from './loyalty/schemas'
import * as taxSchemas from './tax/schemas'

const tables = {
  ...cartSchemas,
  ...offerSchemas,
  ...orderSchemas,
  ...productSchemas,
  ...loyaltySchemas,
  ...taxSchemas,
}

type BenefitType = 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
type ConditionType = 'basket_quantity' | 'basket_total' | 'distinct_items'

type OfferDiscount = {
  id: number
  discount: number
  name: string
  benefitType: BenefitType
  benefitValue: string
  conditionType: ConditionType
  conditionValue: string
}

type VoucherOfferDiscount = OfferDiscount & {
  voucherCode: string
}

export type VariantOption = { name: string; value: string }

// The variant of a cart line, with what pricing and the order snapshot need
export type CartLineVariant = ProductVariant & {
  product: Product
  image: ProductImage | null
  options: VariantOption[]
}

export type CartContent = Cart & {
  lines: Array<
    CartLine & {
      variant: CartLineVariant
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
  lines: Array<CartLine & { variant: CartLineVariant }>
}



export type Database = 
   NodePgDatabase<typeof tables> 
