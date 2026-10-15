# @awecommerce/service

A headless e-commerce library for Node.js and PostgreSQL, built on [Drizzle ORM](https://orm.drizzle.team). It provides services for products, carts, offers and vouchers, orders and payments, and loyalty points. There is no HTTP layer: your app creates the services and calls them.

## Requirements

- Node.js
- PostgreSQL with the `uuid-ossp` extension available (carts use `uuid_generate_v4()`)

## Install

```sh
pnpm add @awecommerce/service drizzle-orm pg
pnpm add -D drizzle-kit
```

## Set up the database

The package does not ship migrations. Generate them in your app from the package's schema with `drizzle-kit`:

```js
// drizzle.config.mjs
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './node_modules/@awecommerce/service/dist/core/db/pg/schema.mjs',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.POSTGRES_URL },
})
```

Enable `uuid-ossp` once per database (migrations fail with `function uuid_generate_v4() does not exist` without it), then generate and apply:

```sh
psql "$POSTGRES_URL" -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'
npx drizzle-kit generate --config drizzle.config.mjs
npx drizzle-kit migrate --config drizzle.config.mjs
```

After upgrading @awecommerce/service, run `generate` and `migrate` again to pick up schema changes.

## Connect

Services take a Drizzle database. Use either your own instance or the package's.

**Your own Drizzle instance.** Pass the package schema, which the services need for their relational queries:

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from '@awecommerce/service/core/db/pg/schema'

const pool = new pg.Pool({ connectionString: process.env.POSTGRES_URL })
export const db = drizzle(pool, { schema })
```

**The package's instance.** `@awecommerce/service/core/db` connects as soon as it is imported, using `POSTGRES_URL`, and throws `POSTGRES_URL is not set` if it is missing. Close it with `closeDb()`:

```ts
import { db } from '@awecommerce/service/core/db'
import { closeDb } from '@awecommerce/service/core/db/pg/db'
```

With `NODE_ENV=test`, `core/db` uses an in-memory PGlite database instead of `POSTGRES_URL`. That is meant for this repo's tests, so don't run your app with `NODE_ENV=test` if it uses `core/db`.

## Use the services

```ts
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import { CartService } from '@awecommerce/service/apps/cart/services/cart'
import { OrderService } from '@awecommerce/service/apps/order/services/order'

const product = await new ProductService(db).create({
  name: 'Mug',
  slug: 'mug',
  sku: 'MUG-1',
  price: '12.5',
})

const cartService = new CartService(db)
const cart = await cartService.create('user-1')
await cartService.addToCart(cart.id, product.variants[0].id, 2)

const order = await new OrderService(db).createFromCart(cart.id)
```

### Product variants

Every product is sold through its variants. Creating a product also creates its first variant from `sku`, `price`, `discountedPrice`, `inventoryCost` and `stockQuantity`, so a product without sizes or colors simply has one variant. The variant holds the SKU, prices, stock, `isActive` and an optional image; the product holds everything shared, such as name, description, category and images.

```ts
import {
  ProductImageService,
  ProductOptionService,
  ProductService,
  ProductVariantService,
} from '@awecommerce/service/apps/product/services/product'

const shirt = await new ProductService(db).create({
  name: 'Shirt',
  slug: 'shirt',
  sku: 'SHIRT-RED-M',
  price: '20',
})
const variants = new ProductVariantService(db)
await variants.update(shirt.variants[0].id, {
  title: 'Red / M',
  options: { Color: 'Red', Size: 'M' },
})
const [blueImage] = await new ProductImageService(db).setImages(shirt.id, [
  'https://example.com/shirt-blue.jpg',
])
await variants.create(shirt.id, {
  sku: 'SHIRT-BLUE-M',
  title: 'Blue / M',
  price: '22',
  imageId: blueImage.id,
  options: { Color: 'Blue', Size: 'M' },
})

const product = await new ProductService(db).get(shirt.id)
// product.variants[n].options: [{ name: 'Color', value: 'Blue' }, { name: 'Size', value: 'M' }]
// product.options: [{ name: 'Color', values: [...] }, { name: 'Size', values: [...] }]
```

- **Options:** each product has its own options (such as Color) and values (such as Red). Passing `options` to `create` or `update` creates any missing ones and replaces the variant's options. Two variants of a product cannot have the same options, so a product with several variants needs options that tell them apart; this throws `A variant with these options already exists`. `ProductOptionService` lists, renames and deletes options and values. `deleteValue` also deletes the variants that have the value, all or none (a variant that was ordered cannot be deleted); it throws `Deleting <value> would delete every variant; delete the option instead` when no variant would be left. `delete` removes an option from every variant, and throws `<name> has more than one value in use; delete its values until one is left`, as the variants would otherwise end up with the same options.
- **Image:** `imageId` must be one of the product's own images (`Image does not belong to the product: <id>`). `setImages` returns the new images and keeps a variant's image when its URL is still in the list. Without an image, the product's `thumbnail` is used.
- **For sale:** a variant can be bought only while it is active and its product is listed. A product is listed when it is active and `Published` (products are `Draft` until then), and its brand and product class (when set) are active, and its category (when set) is not inactive or under an inactive category. `ProductService.list({ listedOnly: true })` and `ProductService.listedProductIds(ids)` use the same rule. Otherwise `addToCart` throws `Product variant is not available: <id>`, and `createFromCart` throws `Product variant is not available: <sku>` if that changed while it was in a cart. `markAsInactive(variantId)` stops one variant; unpublishing or deactivating the product, or deactivating its brand, class or a category above it, stops all of them.
- **Stock:** `stockQuantity` is stored on the variant but not checked when adding to the cart or ordering.
- **Listing:** `ProductService.list` returns each product's `minPrice`, the lowest selling price (`discountedPrice`, else `price`) among its active variants. `minPrice`, `maxPrice` and `sortBy` use that price.
- **Offers:** offers still target products, brands, categories and classes. All variants of a product count towards its quantity conditions, and each cart line gets its own discount from its variant's price.

### Line customizations

Some products need information from the buyer that differs on every purchase, such as the name and number to print on a jersey. The product declares the fields in `customFields`, and the buyer's answers go on the cart line:

```ts
const jersey = await new ProductService(db).create({
  name: 'Jersey',
  slug: 'jersey',
  sku: 'JERSEY-1',
  price: '50',
  customFields: [
    { label: 'Print name', required: true, maxLength: 12 },
    { label: 'Number', required: false, maxLength: 2 },
  ],
})

await cartService.addToCart(cart.id, jersey.variants[0].id, 1, {
  'Print name': 'Dipesh',
  Number: '10',
})
```

- **Fields:** each needs a non-empty `label` (trimmed, and unique within the product), `required` as `true` or `false`, and `maxLength` as a positive whole number. `ProductService.create` and `update` throw otherwise, for example `Duplicate custom field label: <label>`.
- **Answers:** `addToCart(cartId, variantId, quantity, answers?)` stores them on the line as `customizations`, a map of label to text. They are trimmed, and empty optional answers are dropped. A product with no `customFields` (the default `[]`) takes no answers.
- **Validation:** it throws `Missing required field: <label>`, `Field is too long: <label> (max <n> characters)`, `Unknown field: <label>` for a label the product does not declare, and `Field must be text: <label>`. Nothing is added in these cases.
- **Lines:** the same variant with the same answers adds to that line's quantity; different answers make a separate line. So two jerseys with different names are two lines. A unique index on cart, variant and answers keeps it that way even when the same item is added twice at the same moment. Merging a guest cart into the user's cart follows the same rule.
- **Changing answers:** `updateCustomizations(cartId, cartLineId, answers)` replaces a line's answers, with the same validation as `addToCart`. If another line already has the new answers, this line's quantity moves onto it and this line is removed; the method returns the line that holds the item. It throws `Cart line not found: <id>` for a line that is not in that cart.
- **Orders:** checkout copies each line's answers onto the order line's `customizations`. That copy is the record: changing or removing the product's `customFields` later does not change orders already placed.
- **Fields changed while in the cart:** checkout checks the answers again against the product's current `customFields`. If they no longer fit (a new required field, a shorter `maxLength`, or a removed field that was answered), `createFromCart` throws `CustomizationsNoLongerValidError` (with `cartLineId`, `productName` and `reason`) and writes nothing; ask the buyer to update that line with `updateCustomizations`. `getCartSummary` shows the same problem ahead of checkout: each line has `customizationsError`, `null` when its answers fit, otherwise the reason (for example `Missing required field: Initials`).

### Offers

An offer has a range (the products it covers), a condition and a benefit. Reading a cart with offers (`getCartContentForSession(sessionId, true)` or `getCartSummary`) applies them in this order, each on what the earlier ones left:

1. **Site offers** (`type: 'site'`): every cart, guests included. Their user targeting (`includeAllUsers`, `includedUserIds`) is ignored.
2. **User offers** (`type: 'user'`): carts of the users they target: everyone (`includeAllUsers`), these users (`includedUserIds`), or active members of these plans (`includedMembershipPlanIds`). Vouchers use the same targeting.
3. **Vouchers** (`type: 'voucher'`): only after the buyer applies the code with `OfferService.applyVoucherCode`.

The applied offers are listed in `siteOfferDiscounts`, `userOfferDiscounts` and `voucherOfferDiscounts`, on the cart and on each line.

**Offers that do not combine:** an offer with `combinesWithOtherOffers: false` is not added to others. The offers that combine are applied together, as above, and each one that does not is priced alone; the cart gets whichever gives the biggest discount (on a tie, the ones that combine). The total is the same in the summary and at checkout. Free shipping counts as no discount in this comparison. A voucher that loses stays applied to the cart and is listed in `notCombinedVoucherOffers` (`id`, `name`, `voucherCode`): it gives nothing, is not used up, and does not fail checkout. `applyVoucherCode` prices a voucher that does not combine on the cart without its other offers, so it applies even where it would not fit on top of them.

Conditions are checked against the cart lines in the offer's range:

- `basket_quantity`: a product's quantity, across its variants, reaches the value. Only that product's lines get the benefit.
- `basket_total`: the lines' total at selling price, before other offers, reaches the value.
- `distinct_items`: the number of different products reaches the value.

Benefits apply per unit, to at most `maxAffectedItems` units per line when it is set, and never take a line below zero:

- `fixed_amount`: the value off each unit.
- `percentage`: the value percent off each unit's selling price.
- `fixed_price`: each unit sells at the value. Units already cheaper are not discounted.
- `free_shipping`: the shipping charge is waived, in the summary and the order. It adds a discount of `0` to the offer lists, so the offer still counts towards its limits. A cart gets free shipping once: a second free shipping voucher throws `Free shipping already applied`.

A voucher that gives nothing throws `Voucher code is not applicable to any product in the cart`.

Managing offers: `OfferRangeService`, `OfferConditionService`, `OfferBenefitService` and `OfferService` create, get, update, delete and list them. `update` and `delete` throw `NotFoundError` for a missing record, and `delete` returns the deleted one. `OfferService.create` and `update` throw `ValidationError` for a voucher without a `voucherCode` (`A voucher needs a voucher code`) and for another offer with one (`Only vouchers have a voucher code`). `OfferService.get` includes the offer's `condition` and `benefit`; `OfferRangeService.get` lists the range's included and excluded products, brands, categories and classes by id and name.

### Cart summary

`CartService.getCartSummary(sessionId, { shippingMethodId?, redeemPoints? })` returns the cart content with offers and vouchers applied, each line's `tax`, `taxRate`, `requiresShipping`, `isAvailable` and `customizationsError`, and the cart's `requiresShipping`, `requiresAccount` (a membership is in the cart), `notCombinedVoucherOffers`, `subtotal`, `totalOfferDiscount`, `loyaltyDiscount`, `shippingCharge`, `tax`, `total` and `pricesIncludeTax`. It uses the same calculation as `createFromCart`, so pass the `total` you show the customer as `expectedTotal` when they check out:

```ts
const summary = await new CartService(db).getCartSummary(cart.sessionId, {
  shippingMethodId: 1,
})
// show summary.lines, summary.tax, summary.total, ...

const order = await new OrderService(db).createFromCart(cart.id, {
  shippingMethodId: 1,
  expectedTotal: summary.total,
})
```

A line with `isAvailable: false` is no longer for sale (its variant is inactive or its product is not listed, see Product variants); checkout fails with `Product variant is not available: <sku>` until the buyer removes it, so warn on the cart page. Totals still include it.

Each line also has `stockLeft` (what is left of its variant, or `null` when stock is not counted) and `isInStock`, false when the cart holds more of the variant, over all its lines, than is left. Checkout fails with `OutOfStockError` until the buyer lowers the quantity (see Stock).

It does not place an order, use up offers, or redeem points (`redeemPoints` only previews their value, with the same checks as checkout). Like reading the cart with offers, it re-applies the cart's vouchers and drops any that can no longer be applied. Re-applying locks the cart for a moment, so reads of the same cart at the same time each see its vouchers.

### Stock

A variant's `stockQuantity` is counted when its product's class has `trackStock` (the default), and for products without a class. For a class with `trackStock: false`, stock is ignored and the variant can always be bought.

- `addToCart` and `updateQuantity` throw `OutOfStockError` when the cart would hold more of a variant, over all its lines, than is in stock. Its message is `Only 2 left of <sku>`, or `<sku> is out of stock`; its fields are `variantId`, `sku` and `available`.
- `createFromCart` locks the variants, throws the same error (leaving everything unchanged) when stock ran out after the buyer added the item, and otherwise takes the ordered quantity from `stockQuantity`. Each order line records it in `stockTaken`.
- `cancel` puts back what the order took, by `stockTaken`, so a class that started or stopped tracking stock since then does not matter.
- `ProductService.list()` rows have `inStock`: stock is not counted, or an active variant has some. `ProductService.get()` includes the class's `trackStock`.
- `ProductVariantService.stockLevels(variantIds)` and `checkStock(wanted)` are the helpers behind these.

### Shipping

A product class has `requiresShipping` (default true); products without a class are shipped. A class with `requiresShipping: false` is for digital goods.

- `getCartSummary` gives each line's `requiresShipping`, and the cart's: true when any line is shipped. `CartService.requiresShipping(cartId)` answers the same for a cart without pricing it.
- A cart with nothing to ship takes no shipping method: `getCartSummary` and `createFromCart` throw `Nothing in the cart is shipped, so it takes no shipping method` (a `ValidationError`) when given one.
- Each order line records `requiresShipping` when the order is placed, so changing the class later does not change past orders.

### Memberships

`MembershipService` (`apps/membership/services/membership`) keeps three tables:

- `membership_plan`: a tier, with `name`, `slug`, `program` (a shared value such as `music`), `rank` (higher is better) and `isActive`.
- `membership_term`: a product variant that sells a plan, for `months`. Its price and availability are the variant's.
- `membership`: one person's plan from `startsAt` until `endsAt`, `active` or `cancelled`, granted by staff (`grantedBy`) or bought (`orderId`, with `pricePaid`).

Methods: `createPlan`, `updatePlan`, `getPlan`, `listPlans`, `addTerm`, `removeTerm`, `termsForVariants(variantIds)`, `activeMemberships(userId)`, `grant({ userId, planId, months, pricePaid?, orderId?, grantedBy? })`, `cancel(id, reason)`, `cancelForOrder(orderId, reason)`, `forOrder(orderId)` and `history(userId)`.

- **Active** means not cancelled, and the time is between `startsAt` and `endsAt`. Expiry needs no job.
- **Granting** follows the program. A plan ranked above every current membership in its program replaces them: the running one ends now, those waiting are cancelled (`Replaced by <plan>`), and the new one starts now, at full price with no credit. The same plan or a lower one starts when the program's last membership ends, so renewing early extends it.
- **Cancelling** ends one now; cancelling it again throws `Membership is already cancelled: <id>`. Cancelling a renewal leaves the time before it.
- **Member prices:** `OfferService.memberPrices(variants, planIds?)` gives what one unit of each variant costs members: the lowest over the plans (or the given ones), from the user offers that name a plan and that one unit qualifies for, combined by the same rule as the cart. Offers for everyone, site offers, vouchers, free shipping and per-user limits are left out.
- Loyalty earning stays with the app: it can check `activeMemberships()` before calling `addLoyaltyPoint`.

### Signing in with a guest cart

`CartService.mergeCarts(userId, sessionId)` brings a guest cart into a user's account when they sign in. The guest cart (by `sessionId`) becomes the user's cart, and the lines of the user's open cart are added to it (the same item adds up); that older cart is marked `Merged`. Only open carts are used: a checked-out cart is never changed, a cart that belongs to another user is never taken (the user just gets their own cart), and calling it with the user's own cart returns that cart unchanged.

### Guest orders after signing in

`OrderService.claimGuestOrders(userId, email)` gives a user the orders placed as a guest with that email (`guestUser.email`, in any case) and returns their ids. Orders that already have a user are left alone. Call it only with an email the user has proven they own, such as a verified sign-in email; otherwise anyone could see another buyer's orders by signing up with their email.

### Placing an order

`OrderService.createFromCart(cartId, options)` turns an open cart into an order. Prices, offer and voucher discounts, and shipping are all read from the database at that moment; the caller never passes amounts. Carts store only variants and quantities, so an order always uses current prices. It throws `Product variant is not available: <sku>` when a variant in the cart is no longer for sale (see Product variants).

```ts
import {
  OfferLimitReachedError,
  OrderService,
  OrderTotalMismatchError,
  VoucherNoLongerValidError,
} from '@awecommerce/service/apps/order/services/order'

try {
  const order = await new OrderService(db).createFromCart(cart.id, {
    shippingMethodId: 1,
    shippingAddress: { line1: 'Street 1', city: 'Kathmandu' },
    expectedTotal: '25', // the total the customer was shown
  })
  // order.total, order.lines, order.hash, ...
} catch (error) {
  if (error instanceof OrderTotalMismatchError) {
    // Prices changed since the customer saw the total: show
    // error.actualTotal and ask them to confirm
  }
  if (error instanceof OfferLimitReachedError) {
    // Another order used up error.offerName while this one was being placed:
    // tell the customer and reload the cart
  }
  if (error instanceof VoucherNoLongerValidError) {
    // error.voucherCode ran out or expired: tell the customer and reload the
    // cart, which drops it
  }
}
```

- **Options:** `shippingMethodId` (its price becomes `shippingCharge`, and its details are kept in `shippingMethod`), `shippingAddress`, `guestUser` (for carts without a user), `metadata`, `redeemPoints` (see below), and `expectedTotal`. The order's user is always the cart's user.
- **Total:** the sum of each line's `quantity × (price − discount)`, minus offer and voucher discounts, minus the loyalty discount, plus shipping, plus tax when prices exclude tax (see [Tax](#tax)). It is stored in the order's `total` column, so orders can be filtered and sorted by it.
- **`expectedTotal`:** if the computed total differs, it throws `OrderTotalMismatchError` (with `expectedTotal` and `actualTotal`) and writes nothing.
- **Order lines:** each line has `productId` and `variantId`. `price` is the variant's `price`, or its `discountedPrice` when there is no `price`; `discount` is `price − discountedPrice` when both are set. A line whose variant has neither is stored with `price` `null` and counts as zero. `productName`, `variantTitle`, `sku`, `imageUrl` (the variant's image, else the product's thumbnail) and `options` (such as `[{ name: 'Color', value: 'Red' }, { name: 'Size', value: 'M' }]`) are copied onto the line, so renaming or deleting a product, variant, image or option later does not alter past orders.
- **Offers:** the applied offer and voucher discounts are stored in `offers`, and their sum in `discount`. Each applied offer's usage is recorded once per order, which uses up its `limitPerUser` and `overallLimit`; guest orders count towards `overallLimit` only.
- **Errors:** it throws `Cart not found: <id>`, `Cart is not open: <id>` (for example, already ordered), `Cannot create an order without lines`, `Shipping method not found: <id>`, `Nothing in the cart is shipped, so it takes no shipping method` and, for a guest cart with a membership, `Sign in to buy a membership`. Nothing is written in any of these cases.
- **One order per cart:** the cart is locked while the order is created and then frozen, so two checkouts of the same cart at the same moment produce exactly one order.
- **Loyalty points:** `redeemPoints` redeems that many of the user's points. Their value (`points × redeemRate`) is stored as `loyaltyDiscount` and reduces the products, not shipping, before tax: it is spread across the lines in proportion to their amounts, and each line is taxed on what is left. The points are taken from the balance in the same transaction. It throws `Guests cannot redeem loyalty points`, `Loyalty points cannot be redeemed` (loyalty disabled or no `redeemRate`), `Insufficient loyalty points`, and `Points are worth more than the order's products` (after offer discounts); nothing is written in any of these cases.
- **Offer limits at checkout:** offers are checked again while the order is created, with the offers locked, so simultaneous checkouts can never use an offer beyond its `overallLimit` or `limitPerUser`. If a user offer ran out in the meantime, `createFromCart` throws `OfferLimitReachedError` (with `offerId` and `offerName`) and writes nothing. If a voucher applied to the cart can no longer be applied (it ran out, expired, was deactivated, or no longer matches the cart's products), `createFromCart` throws `VoucherNoLongerValidError` (with `offerId` and `voucherCode`) and writes nothing; the cart keeps its vouchers, so reload it with `getCartContentForSession(sessionId, true)` to drop the invalid one and show the new total.
- **Status changes:** `changeStatus(orderId, newStatus, changedBy?)` records the order's current status as the previous status in its history. It throws `Order not found: <id>`, `Order is cancelled: <id>` (cancelled orders cannot change), `Order is already <status>: <id>`, and `Use cancel() to cancel an order` for `'Cancelled'`.
- **Cancelling:** `cancel(orderId, cancelledBy, reason, remarks?)` records the order's current status as the previous status in its history, and gives back the usage of the order's offers, so their limits can be used again (guest orders give back only the overall count), and gives back any loyalty points redeemed for the order. It throws `Order is already cancelled: <id>` for an order that is already cancelled, including when two cancels run at the same moment, so usage is never given back twice.

### Lists

The `list()` methods (products, brands, categories, product classes, offers, offer ranges, conditions and benefits, orders) take a filter with an optional `pagination: { page, size }`:

```ts
const all = await productService.list({ isActive: true })
// all: Product[]

const page = await productService.list({ isActive: true, pagination: { page: 2, size: 20 } })
// page: { results: Product[]; pagination: { page, size, total, pages } }
```

The return type follows the filter: an array without `pagination`, a page with it, and either one when the filter's type allows both, for example a `pagination` that may be `undefined`. Unknown filter fields are type errors.

`OrderService.list({ q })` matches an order id, a user id, or part of the guest's email or name. Users are not the library's, so to find members by their own details, look up the matching user ids in your users table and pass them as `qUserIds`; their orders match `q` too.

### Categories

Categories form a tree through `parentId`. `CategoryService.update` refuses (with a `ValidationError`) a parent that is the category itself or a category under it.

- `ProductService.list({ categories, includeSubcategories: true })` matches products in those categories and in every category under them, at any depth. Without `includeSubcategories`, only the categories themselves.
- `ProductService.list()` leaves out products whose category is inactive or under an inactive category. Pass `includeInactiveCategories: true` to include them.
- `CategoryService.list({ excludeInactiveBranches: true })` leaves out categories under an inactive category; `isActive` only checks each category's own flag.
- `CategoryService.list({ hasListedProducts: true })` keeps categories that hold a listed product (see Product variants), in them or in a category below them. `BrandService.list({ hasListedProducts: true })` keeps brands with a listed product. Use them for store menus, so no entry leads to an empty page.

### Store settings

`StoreSettingsService` keeps the store's `name`, `currency` (ISO 4217, default `USD`) and `locale` (BCP 47, default `en-US`), used to show prices. `getSettings()` returns them; `updateSettings(changes)` changes the given ones, stores the currency in capitals and the locale in its standard form (`en-us` becomes `en-US`), and returns all of them. It throws `Unknown currency: <code>` or `Unknown locale: <tag>` for values `Intl` does not know.

### Product admin helpers

- `ProductService.list()` rows include `maxPrice` (with `minPrice`, over active variants), `variantCount` (all variants), `totalStock` (active variants) and `singleVariant`: for a product with exactly one variant, its `id`, `sku`, `price`, `discountedPrice`, `stockQuantity` and `isActive`, otherwise `null`. `sortBy` also takes `nameAsc`, `nameDesc`, `newest` (the default) and `oldest`.
- `ProductService.updateMany(ids, changes)` changes `status`, `isActive`, `isFeatured` or `isBestSeller` on several products in one transaction, and throws `Product not found: <id>` (changing none) when one is missing.
- `ProductVariantService.generateVariants(productId, { Size: ['S', 'M'], Colour: ['Red'] })` creates a variant for every combination the product does not have yet, at most 100. New variants copy the first variant's prices, start with no stock, and get SKUs from its SKU and the values (`SHIRT-S-RED`, with `-2` and so on added if taken). A product's only variant without options takes the first combination instead, keeping its id, prices and stock. It returns the variants it created or changed.

### Services and import paths

| Import path | Exports |
|---|---|
| `@awecommerce/service/apps/product/services/product` | `ProductService`, `ProductVariantService`, `ProductOptionService`, `BrandService`, `CategoryService`, `ProductClassService`, `ProductImageService`, `RelatedProductService` |
| `@awecommerce/service/apps/cart/services/cart` | `CartService` |
| `@awecommerce/service/apps/offer/services/offer` | `OfferService`, `OfferRangeService`, `OfferConditionService`, `OfferBenefitService` |
| `@awecommerce/service/apps/order/services/order` | `OrderService`, `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError`, `CustomizationsNoLongerValidError` |
| `@awecommerce/service/apps/order/services/shipping-address` | `ShippingAddressService` |
| `@awecommerce/service/apps/order/services/shipping-method` | `ShippingMethodService` |
| `@awecommerce/service/apps/loyalty/services/loyalty` | `LoyaltyService` |
| `@awecommerce/service/apps/tax/services/tax` | `TaxService`, `calculateTax` |
| `@awecommerce/service/apps/store/services/store` | `StoreSettingsService` |
| `@awecommerce/service/apps/<module>/schemas` | That module's tables and types, for `product`, `cart`, `offer`, `order`, `loyalty`, `tax` and `store` |
| `@awecommerce/service/core/db/pg/schema` | All tables, for your Drizzle instance and `drizzle-kit` |
| `@awecommerce/service/core/db` | `db`, the package's database instance |
| `@awecommerce/service/core/db/pg/db` | `closeDb`, `initializeDb`, `getClient` |
| `@awecommerce/service/apps/types` | Shared types such as `CartContent` and `Database` |
| `@awecommerce/service/core/errors` | `NotFoundError`, `ValidationError` |

Every path works with both `import` and `require`, and includes TypeScript types.

### Errors

The services throw:

- `NotFoundError` when a record asked for by id does not exist, such as `Cart not found: <id>` or `Product variant not found: <id>`.
- `ValidationError` when the input, or the record's current state, does not allow the operation, such as `Quantity must be at least 1`, `Invalid voucher code`, `Insufficient loyalty points` or `Order is already cancelled: <id>`. The message says why and can be shown to the user.
- The checkout errors described in [Placing an order](#placing-an-order).
- `OutOfStockError` from adding to the cart, changing a quantity or checkout (see [Stock](#stock)).
- A plain `Error` for setup problems (`POSTGRES_URL is not set`, `ORDER_HASH_SECRET is not set`) and for anything unexpected, such as a database failure.

Check them with `instanceof`, or by `name`, which matches the class name.

## Tax

Tax is set up store-wide with `TaxService`, and per product class:

```ts
import { TaxService } from '@awecommerce/service/apps/tax/services/tax'
import { ProductClassService } from '@awecommerce/service/apps/product/services/product'

await new TaxService(db).updateSettings({
  pricesIncludeTax: false, // prices are entered without tax; tax is added at checkout
  defaultRate: '13', // percentage
  taxShipping: true, // tax shipping at the default rate
})

// A class with its own rate; products without a class, or whose class has no
// rate, use the default rate
await new ProductClassService(db).create({ name: 'Exempt', slug: 'exempt', taxRate: '0' })
```

`createFromCart` then works out tax for each order:

- **What is taxed:** each line's amount after its sale price and its offer and voucher discounts, at the product class's `taxRate` or the store's `defaultRate`. Shipping is taxed at `defaultRate` when `taxShipping` is on.
- **`pricesIncludeTax`:** one store-wide switch. When off, tax is added to the total. When on, prices and shipping already contain tax, so the total does not change and the tax is only split out for the record.
- **Rounding:** tax is rounded to 2 decimal places per line (and for shipping), then added up.
- **Recorded on the order:** each order line stores its `tax` and the `taxRate` used, and the order's `tax` is the sum including shipping tax, so past orders keep their tax when rates change.

Without any settings, the default rate is `0`, so no tax is charged.

## Transactions

Service methods that write more than once (creating an order, merging carts, redeeming points, and so on) run in a database transaction, so a failure leaves nothing half-written.

To combine several calls into one unit, open a transaction yourself and create the services with it. Their own transactions become savepoints inside yours, and everything commits or rolls back together:

```ts
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'

const order = await db.transaction(async (tx) => {
  const created = await new OrderService(tx).createFromCart(cart.id)
  await new LoyaltyService(tx).redeemPoints('user-1', created.id, 30)
  return created
})
```

If anything inside throws, neither the order nor the redemption is saved.

## Data formats

- **Numbers.** Prices, discounts, amounts and points are `numeric(100, 20)` columns. They come back as strings with 20 decimal places, for example `"12.50000000000000000000"`. Convert them with `Number(...)` or `decimal.js` before doing math or displaying them.
- **Order hashes.** `OrderService.createFromCart` returns a `hash` that lets someone view the order without logging in (`getByHash(orderId, hash)`). It is an HMAC-SHA256 of the order id with `ORDER_HASH_SECRET`, encoded as `base64url`, so it is safe to put in a URL as is. Changing the secret invalidates every existing hash.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_URL` | `core/db`, `migrate:pg`, `seed:product` | Postgres connection URL |
| `ORDER_HASH_SECRET` | `OrderService` (`createFromCart`, `getByHash`, `generateHash`, `checkHash`) | Secret for order hashes. Required: these methods throw `ORDER_HASH_SECRET is not set` without it. Use a long random value, such as the output of `openssl rand -base64 32` |
| `TEST_POSTGRES_URL` | Tests | An empty Postgres database for the tests that need a real server. Without it, those tests are skipped |
| `PG_BIN` | `test:pg` | Folder containing `initdb` and `pg_ctl`, if they are not on your `PATH` (for example `/usr/lib/postgresql/16/bin` on Debian) |
| `NODE_ENV` | `core/db` | `test` makes `core/db` use an in-memory PGlite database |

## Development

This package lives in `packages/service`. The scripts below work from this directory and from the repo root.

```sh
pnpm install   # also builds dist
```

Create `.env` by hand; it is not in the repo. The `migrate:pg` and `seed:product` scripts read it and fail if it is missing, and the tests load it if it exists:

```sh
POSTGRES_URL=postgres://user:password@localhost:5432/awecommerce
ORDER_HASH_SECRET=change-me-to-a-long-random-value
```

### Scripts

| Script | What it does |
|---|---|
| `pnpm test` | Runs the tests with Vitest in watch mode (`pnpm vitest run` for a single run). Tests use an in-memory PGlite database; the tests that need a real Postgres are skipped unless `TEST_POSTGRES_URL` is set |
| `pnpm test:pg` | Runs the whole suite against a real Postgres, including the concurrency tests. Uses `TEST_POSTGRES_URL` if set; otherwise starts a temporary server with `initdb` and `pg_ctl` (from `PATH` or `PG_BIN`) in a temp folder and removes it afterwards, also on failure or Ctrl-C. Extra arguments go to Vitest, for example `pnpm test:pg loyalty-concurrency` |
| `pnpm typecheck` | Type-checks the project with `tsc --noEmit` |
| `pnpm build` | Builds `dist` (ES modules, CommonJS and type declarations) from `apps` and `core`, without tests |
| `pnpm check:dist` | Builds, then loads every module of the built package through its own name and `exports` map with both `import` and `require`. Fails if a module does not load, a key export is missing, or anything other than library code is in `dist` |
| `prepublishOnly` | Runs automatically before `publish`: `typecheck`, then the tests with `test:pg --if-available`, then `check:dist`. Any failure stops the publish |
| `pnpm generate` | Generates a migration in `migrations/pg` from the schema with `drizzle-kit`. Always create migrations this way |
| `pnpm migrate:pg` | Applies `migrations/pg` to `POSTGRES_URL` |
| `pnpm seed:product` | Inserts a sample product into `POSTGRES_URL` |

**`--if-available`:** with this flag, `test:pg` does not fail when the Postgres tools are missing. It prints a warning and runs the suite without Postgres, so the Postgres-only tests are skipped. If the tools are present but starting the server fails, it still fails. `prepublishOnly` uses it so publishing works on machines without Postgres; remove the flag there to require Postgres for every publish.

### Changing the schema

1. Edit the tables in `apps/<module>/schemas/pg.ts`.
2. Run `pnpm generate` to create the migration, and commit it.
3. Run `pnpm test` (and `pnpm test:pg` for the concurrency tests).
