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
await cartService.addToCart(cart.id, product.id, 2)

const order = await new OrderService(db).createFromCart(cart.id)
```

### Cart summary

`CartService.getCartSummary(sessionId, { shippingMethodId? })` returns the cart content with offers and vouchers applied, each line's `tax` and `taxRate`, and the cart's `subtotal`, `totalOfferDiscount`, `shippingCharge`, `tax`, `total` and `pricesIncludeTax`. It uses the same calculation as `createFromCart`, so pass the `total` you show the customer as `expectedTotal` when they check out:

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

It does not place an order or use up offers. Like reading the cart with offers, it re-applies the cart's vouchers and drops any that can no longer be applied.

### Placing an order

`OrderService.createFromCart(cartId, options)` turns an open cart into an order. Prices, offer and voucher discounts, and shipping are all read from the database at that moment; the caller never passes amounts. Carts store only products and quantities, so an order always uses current prices.

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

- **Options:** `shippingMethodId` (its price becomes `shippingCharge`, and its details are kept in `shippingMethod`), `shippingAddress`, `guestUser` (for carts without a user), `metadata`, and `expectedTotal`. The order's user is always the cart's user.
- **Total:** the sum of each line's `quantity × (price − discount)`, minus offer and voucher discounts, plus shipping, plus tax when prices exclude tax (see [Tax](#tax)). Orders do not store it; `createFromCart` returns it as `total`. Loyalty discounts are not included.
- **`expectedTotal`:** if the computed total differs, it throws `OrderTotalMismatchError` (with `expectedTotal` and `actualTotal`) and writes nothing.
- **Order lines:** `price` is the product's `price`, or its `discountedPrice` when there is no `price`; `discount` is `price − discountedPrice` when both are set. A line whose product has neither is stored with `price` `null` and counts as zero. `productName` and `productSku` are copied onto the line, so renaming or changing a product later does not alter past orders.
- **Offers:** the applied offer and voucher discounts are stored in `offers`, and their sum in `discount`. Each applied offer's usage is recorded once per order, which uses up its `limitPerUser` and `overallLimit`; guest orders count towards `overallLimit` only.
- **Errors:** it throws `Cart not found: <id>`, `Cart is not open: <id>` (for example, already ordered), `Cannot create an order without lines` and `Shipping method not found: <id>`. Nothing is written in any of these cases.
- **One order per cart:** the cart is locked while the order is created and then frozen, so two checkouts of the same cart at the same moment produce exactly one order.
- **Offer limits at checkout:** offers are checked again while the order is created, with the offers locked, so simultaneous checkouts can never use an offer beyond its `overallLimit` or `limitPerUser`. If a user offer ran out in the meantime, `createFromCart` throws `OfferLimitReachedError` (with `offerId` and `offerName`) and writes nothing. If a voucher applied to the cart can no longer be applied (it ran out, expired, was deactivated, or no longer matches the cart's products), `createFromCart` throws `VoucherNoLongerValidError` (with `offerId` and `voucherCode`) and writes nothing; the cart keeps its vouchers, so reload it with `getCartContentForSession(sessionId, true)` to drop the invalid one and show the new total.
- **Status changes:** `changeStatus(orderId, newStatus, changedBy?)` records the order's current status as the previous status in its history. It throws `Order not found: <id>`, `Order is cancelled: <id>` (cancelled orders cannot change), `Order is already <status>: <id>`, and `Use cancel() to cancel an order` for `'Cancelled'`.
- **Cancelling:** `cancel(orderId, cancelledBy, reason, remarks?)` records the order's current status as the previous status in its history, and gives back the usage of the order's offers, so their limits can be used again (guest orders give back only the overall count). It throws `Order is already cancelled: <id>` for an order that is already cancelled, including when two cancels run at the same moment, so usage is never given back twice.

### Services and import paths

| Import path | Exports |
|---|---|
| `@awecommerce/service/apps/product/services/product` | `ProductService`, `BrandService`, `CategoryService`, `ProductClassService`, `ProductImageService`, `RelatedProductService` |
| `@awecommerce/service/apps/cart/services/cart` | `CartService` |
| `@awecommerce/service/apps/offer/services/offer` | `OfferService`, `OfferRangeService`, `OfferConditionService`, `OfferBenefitService` |
| `@awecommerce/service/apps/order/services/order` | `OrderService`, `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError` |
| `@awecommerce/service/apps/order/services/shipping-address` | `ShippingAddressService` |
| `@awecommerce/service/apps/order/services/shipping-method` | `ShippingMethodService` |
| `@awecommerce/service/apps/loyalty/services/loyalty` | `LoyaltyService` |
| `@awecommerce/service/apps/tax/services/tax` | `TaxService`, `calculateTax` |
| `@awecommerce/service/apps/<module>/schemas` | That module's tables and types, for `product`, `cart`, `offer`, `order`, `loyalty` and `tax` |
| `@awecommerce/service/core/db/pg/schema` | All tables, for your Drizzle instance and `drizzle-kit` |
| `@awecommerce/service/core/db` | `db`, the package's database instance |
| `@awecommerce/service/core/db/pg/db` | `closeDb`, `initializeDb`, `getClient` |
| `@awecommerce/service/apps/types` | Shared types such as `CartContent` and `Database` |

Every path works with both `import` and `require`, and includes TypeScript types.

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
