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
const content = await cartService.getCartContentForSession(cart.sessionId)

const order = await new OrderService(db).create(
  { userId: 'user-1', cartId: cart.id },
  content.lines,
)
```

`OrderService.create` throws `Cannot create an order without lines` for an empty list. Nothing is written in that case. A line whose product has no list price is still accepted: the order line stores `discountedPrice` when that is set, and `null` when the product has neither price.

### Services and import paths

| Import path | Exports |
|---|---|
| `@awecommerce/service/apps/product/services/product` | `ProductService`, `BrandService`, `CategoryService`, `ProductClassService`, `ProductImageService`, `RelatedProductService` |
| `@awecommerce/service/apps/cart/services/cart` | `CartService` |
| `@awecommerce/service/apps/offer/services/offer` | `OfferService`, `OfferRangeService`, `OfferConditionService`, `OfferBenefitService` |
| `@awecommerce/service/apps/order/services/order` | `OrderService` |
| `@awecommerce/service/apps/order/services/shipping-address` | `ShippingAddressService` |
| `@awecommerce/service/apps/order/services/shipping-method` | `ShippingMethodService` |
| `@awecommerce/service/apps/loyalty/services/loyalty` | `LoyaltyService` |
| `@awecommerce/service/apps/<module>/schemas` | That module's tables and types, for `product`, `cart`, `offer`, `order` and `loyalty` |
| `@awecommerce/service/core/db/pg/schema` | All tables, for your Drizzle instance and `drizzle-kit` |
| `@awecommerce/service/core/db` | `db`, the package's database instance |
| `@awecommerce/service/core/db/pg/db` | `closeDb`, `initializeDb`, `getClient` |
| `@awecommerce/service/apps/types` | Shared types such as `CartContent` and `Database` |

Every path works with both `import` and `require`, and includes TypeScript types.

## Transactions

Service methods that write more than once (creating an order, merging carts, redeeming points, and so on) run in a database transaction, so a failure leaves nothing half-written.

To combine several calls into one unit, open a transaction yourself and create the services with it. Their own transactions become savepoints inside yours, and everything commits or rolls back together:

```ts
import { LoyaltyService } from '@awecommerce/service/apps/loyalty/services/loyalty'

const order = await db.transaction(async (tx) => {
  const created = await new OrderService(tx).create(
    { userId: 'user-1', cartId: cart.id },
    content.lines,
  )
  await new LoyaltyService(tx).redeemPoints('user-1', created.id, 30)
  return created
})
```

If anything inside throws, neither the order nor the redemption is saved.

## Data formats

- **Numbers.** Prices, discounts, amounts and points are `numeric(100, 20)` columns. They come back as strings with 20 decimal places, for example `"12.50000000000000000000"`. Convert them with `Number(...)` or `decimal.js` before doing math or displaying them.
- **Order hashes.** `OrderService.create` returns a `hash` that lets someone view the order without logging in (`getByHash(orderId, hash)`). It is an HMAC-SHA256 of the order id with `ORDER_HASH_SECRET`, encoded as `base64url`, so it is safe to put in a URL as is. Changing the secret invalidates every existing hash.

## Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_URL` | `core/db`, `migrate:pg`, `seed:product` | Postgres connection URL |
| `ORDER_HASH_SECRET` | `OrderService` (`create`, `getByHash`, `generateHash`, `checkHash`) | Secret for order hashes. Required: these methods throw `ORDER_HASH_SECRET is not set` without it. Use a long random value, such as the output of `openssl rand -base64 32` |
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
