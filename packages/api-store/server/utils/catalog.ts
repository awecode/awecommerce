// A variant as buyers see it: everything but its cost
export const storeVariant = <V extends { inventoryCost: unknown }>({
  inventoryCost: _,
  ...variant
}: V) => variant
