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
      }[]
      voucherOfferDiscounts: {
        id: number
        discount: number
        name: string
      }[]
      totalOfferDiscount: number
    }
  >[]
  userOfferDiscounts: {
    id: number
    discount: number
    name: string
  }[]
  voucherOfferDiscounts: {
    id: number
    discount: number
    name: string
  }[]
  totalOfferDiscount: number
}
