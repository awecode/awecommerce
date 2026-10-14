// Whether buyers may see a product
export const isListed = (product: { isActive: boolean | null; status: string | null }) =>
  product.isActive === true && product.status === 'Published'

// A variant as buyers see it: everything but its cost
export const storeVariant = <V extends { inventoryCost: unknown }>({
  inventoryCost: _,
  ...variant
}: V) => variant
