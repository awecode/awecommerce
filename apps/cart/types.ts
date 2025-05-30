import { Cart, CartLine } from './schemas'

export type CartContent = Cart & {
  lines: Array<
    CartLine & {
      product: {
        price: number
        discountedPrice?: number
      }
      userOfferDiscounts: {
        id: number
        discount: number
        name: string
        benefitType: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
        benefitValue: number
      }[]
      voucherOfferDiscounts: {
        id: number
        discount: number
        name: string
        voucherCode: string
        benefitType: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
        benefitValue: number
      }[]
      totalOfferDiscount: number
    }
  >[]
  userOfferDiscounts: {
        id: number
        discount: number
        name: string
        benefitType: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
        benefitValue: number
      }[]
  voucherOfferDiscounts: {
    id: number
    discount: number
    name: string
    voucherCode: string
    benefitType: 'fixed_amount' | 'percentage' | 'free_shipping' | 'fixed_price'
    benefitValue: number
  }[]
  totalOfferDiscount: number
}
