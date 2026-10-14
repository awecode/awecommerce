# awecommerce

Monorepo for Awecommerce: the library, the API layers, and the storefront and backoffice apps.

| Package | Path | Role |
|---|---|---|
| `@awecommerce/service` | `packages/service` | Headless e-commerce library for Node.js and PostgreSQL |
| `@awecommerce/auth` | `packages/auth` | Nuxt layer: magic link sign-in with Better Auth ([upstream](https://github.com/awecode/nuxt-better-auth-layer), copied in and adapted) |
| `@awecommerce/api-core` | `packages/api-core` | Nuxt layer: database pool (`useDb`), service error mapping (`defineServiceHandler`), `/health`; extends auth |
| `@awecommerce/api-store` | `packages/api-store` | Nuxt layer: storefront API under `/api/store`, extends api-core |
| `@awecommerce/api-admin` | `packages/api-admin` | Nuxt layer: backoffice API under `/api/admin`, extends api-core |
| `@awecommerce/storefront` | `apps/storefront` | Nuxt app (SSR), extends api-store |
| `@awecommerce/backoffice` | `apps/backoffice` | Nuxt app (SPA), extends api-admin |

Each app extends one API layer, so it serves only that API and `useFetch` knows each route's response type. The admin API is not part of the storefront.

## Run the apps

Each app reads its settings from the environment (see the app's `.env.example`): the database (`NUXT_POSTGRES_URL`), its public URL (`BETTER_AUTH_URL`) and `BETTER_AUTH_SECRET`. Migrate the database first, for the library's tables and the auth tables:

```sh
pnpm migrate        # library tables (see packages/service/README.md)
pnpm migrate:auth   # users, sessions, accounts, verifications (POSTGRES_URL, or packages/auth/.env)
```

Then:

```sh
pnpm dev:storefront
pnpm dev:backoffice
```

## Backoffice

`apps/backoffice` is the staff app: Nuxt UI 4 on Tailwind 4, an SPA (`ssr: false`), with data loaded through Pinia Colada.

- **Look:** zinc neutrals with a blue accent, Inter (bundled, no font service), compact controls (Nuxt UI's small sizes, set in `app/app.config.ts`), 48px headers. Light or dark follows the system and can be switched in the user menu.
- **Shell** (`app/layouts/default.vue`): collapsible, resizable sidebar with the store name, ⌘K (Ctrl+K) palette, and the user menu (appearance, sign out).
- **Sign-in:** `/login` (email, then a link or a pasted token), `/auth/confirm` (where the emailed link lands) and `/auth/error` replace the auth layer's pages. A signed-in user without the admin role gets `/no-access`.
- **Prices:** `useMoney()` formats decimal strings in the store's currency and locale (`/api/admin/settings/store`).

`pnpm test:backoffice` runs browser tests: it builds the app, starts it against a temporary Postgres, and drives Chromium (sign-in, staff and customer access, dark mode). It uses Playwright's Chromium (install it with `pnpm --filter @awecommerce/backoffice exec playwright-core install chromium-headless-shell`) or, with `CHROMIUM_PATH` set (for example `CHROMIUM_PATH=/usr/bin/chromium`), a browser already on the machine.

## Sign-in

Customers and staff sign in the same way, with a magic link, and share one `users` table. Staff are users with `role: 'admin'`; emails listed in `NUXT_AUTH_ADMIN_EMAILS` get it when they first sign in. Without SES settings, development prints the sign-in email to the console.

- Every `/api/admin` route needs an admin (401 signed out, 403 for customers), set in `packages/api-admin/server/middleware/admin.ts` rather than through an environment variable.
- The storefront's pages are public (`authRequiredByDefault: false`); a page that needs a customer sets `definePageMeta({ auth: true })`. The backoffice's pages need sign-in by default and send guests to `/login`.
- In routes, `getUser(event)`, `requireAuthenticated(event)` and `requireAdmin(event)` come from the auth layer (see `packages/auth/README.md`).
- To run code after every sign-in, call `onSignedIn(({ user }) => ...)` from a Nitro plugin. The store uses it to link the orders a buyer placed as a guest with the same email (`packages/api-store/server/plugins/claim-guest-orders.ts`), only when that email is verified, which magic link sign-in does.
- The auth tables have their own `drizzle-kit` schema and migrations in `packages/auth` (`pnpm generate:auth`, `pnpm migrate:auth`), recorded in `__drizzle_migrations_auth`, apart from the library's.
- Its login components use Tailwind classes; the storefront does not have Tailwind yet (the backoffice has its own sign-in pages).

Changes from the upstream layer: it takes `useDb` from api-core, adds the auth tables to its schema, mounts the email template as `assets:auth` (so no copying into each app), sets the admin role from `NUXT_AUTH_ADMIN_EMAILS`, keeps the plugins' types (`role`, the magic link endpoints), and drops the demo pages.

`pnpm test:auth` runs the layer's own tests.

## Store API

### Catalog

Buyers see, and can buy, only listed products: active and `Published`, with an active brand and product class when set, and not under an inactive category at any depth (the library's `listedProduct` rule). They see only active variants, and never a variant's `inventoryCost` (not in product pages, not in the cart).

| Route | Does |
|---|---|
| `GET /api/store/products` | One page of products. Query: `q`, `categories` (ids, `1,2` or repeated; each includes its subcategories), `brands` (ids), `minPrice`, `maxPrice`, `sortBy` (`priceAsc` or `priceDesc`; newest first by default), `featured`, `bestSeller`, `page`, `size` (at most 100) |
| `GET /api/store/products/:slug` | A product with its active variants, options, images and listed related products |
| `GET /api/store/settings` | The store's `name`, `currency` and `locale`, for showing prices |
| `GET /api/store/categories` | Active categories with a listed product in them or below them, each with its `parent`. Categories under an inactive category are left out. |
| `GET /api/store/brands` | Active brands with a listed product |

The query schema is `productListQuery` in `packages/api-store/shared/utils/catalog.ts`.

### Cart

The cart is found by the `awe_cart` cookie (httpOnly), which holds the cart's `sessionId`. It is set on the first add; a checked-out cart counts as no cart, so the next add starts a new one.

Signed in, the buyer gets their own open cart on every device. A guest cart still in the cookie is merged into it the first time they are seen signed in (same items add up), and the cookie is pointed at the account cart. After signing out, the cookie no longer shows that cart: a cart that belongs to a user is only shown to that user. Every change returns the cart summary (`CartService.getCartSummary`).

| Route | Body | Does |
|---|---|---|
| `GET /api/store/cart?shippingMethodId=&redeemPoints=` | | The cart summary, with that method's charge and tax, and the value of those loyalty points (signed in), when given, or 204 with no body before the first add |
| `POST /api/store/cart/lines` | `{ variantId, quantity, customizations? }` | Adds a variant, creating the cart |
| `PATCH /api/store/cart/lines/:id` | `{ quantity?, customizations? }` | Changes the line; both or neither are saved |
| `DELETE /api/store/cart/lines/:id` | | Removes the line |
| `POST /api/store/cart/vouchers` | `{ code }` | Applies a voucher |
| `DELETE /api/store/cart/vouchers/:code` | | Removes a voucher |

### Checkout

| Route | Body | Does |
|---|---|---|
| `GET /api/store/shipping-methods` | | The shipping methods |
| `POST /api/store/checkout` | `{ shippingMethodId?, expectedTotal, shippingAddress or shippingAddressId, guestUser?, redeemPoints? }` | Places the order and clears the cart cookie. Returns the order with its `hash`. |
| `GET /api/store/orders/:id?hash=` | | The order, for its confirmation page, for whoever holds the link. A wrong hash gives 404. |

- `expectedTotal` is the cart summary's `total` the buyer confirmed (with the same `shippingMethodId`). If the order would cost anything else, checkout gives 409 with `data.code` `OrderTotalMismatchError` and `data.actualTotal`, and the cart stays as it is.
- The other 409s: `VoucherNoLongerValidError`, `OfferLimitReachedError` and `CustomizationsNoLongerValidError`, with their fields in `data` (see the library README). Reload the cart and show the buyer what changed.
- `shippingAddress` needs `line1`, `city` and `country`; `line2`, `houseNo`, `province`, `postalCode`, `countryCode` and `instructions` are optional. Signed-in buyers can pass `shippingAddressId` (one of their saved addresses) instead; its fields are copied onto the order. Pass one of the two.
- Guests must pass `guestUser` (`name` and `email`; `phone` is optional). Signed in, the order belongs to the user and `guestUser` is ignored.
- `redeemPoints` (signed in) redeems loyalty points; preview them with the same value in `GET /api/store/cart?redeemPoints=`. Guests get 422.
- Other fields are dropped.
- The storefront needs `ORDER_HASH_SECRET` (see its `.env.example`) to sign order links.

### Account (signed in; 401 otherwise)

| Route | Body | Does |
|---|---|---|
| `GET /api/store/addresses` | | Saved addresses, newest first |
| `POST /api/store/addresses` | address fields, `isDefault?` | Saves one; a default replaces the previous default |
| `PATCH /api/store/addresses/:id` | any address fields, `isDefault?` | Changes one (404 if it is not the buyer's) |
| `DELETE /api/store/addresses/:id` | | Deletes one (404 if it is not the buyer's) |
| `GET /api/store/orders?page=&size=` | | The buyer's orders, newest first, one page at a time (`size` at most 100). Orders placed as a guest with the same email are linked on sign-in. |
| `GET /api/store/orders/:id` | | One of the buyer's orders, without a hash (404 if it is not theirs) |
| `GET /api/store/loyalty` | | `{ canRedeem, redeemRate, points, value }`: the points that can be redeemed now and their worth |

The body schemas are in `packages/api-store/shared/utils/cart.ts` and `checkout.ts`, and are auto-imported in the apps too, for forms. A body of the wrong shape gives 400.

`pnpm test:api` runs the route tests: it builds the layer and calls it over HTTP, against a temporary Postgres (or `TEST_POSTGRES_URL`).

## Admin API

Every `/api/admin` route needs a signed-in admin (see Sign-in). The body schemas are in `packages/api-admin/shared/utils/catalog.ts`, auto-imported in the backoffice for forms. Money is a decimal string (`"12.50"`).

### Catalog

| Route | Body or query | Does |
|---|---|---|
| `GET /api/admin/products` | `q`, `status`, `active`, `categories`, `brands`, `productClass`, `featured`, `bestSeller`, `sortBy` (`newest`, `oldest`, `nameAsc`, `nameDesc`, `priceAsc`, `priceDesc`), `page`, `size` | Every product, drafts, inactive ones and those under inactive brands, categories or classes included. Each row has `minPrice`, `maxPrice`, `variantCount`, `totalStock` and, for a product with one variant, `singleVariant` (its id, SKU, prices and stock, for editing in place). |
| `POST /api/admin/products/bulk` | `{ ids, changes }` with any of `status`, `isActive`, `isFeatured`, `isBestSeller` | Changes up to 100 products at once: all, or none when one is missing (404) |
| `POST /api/admin/products` | product fields, plus the first variant's `sku`, `price`, `discountedPrice`, `inventoryCost`, `stockQuantity` | Creates a product (as `Draft`) with its first variant |
| `GET /api/admin/products/:id` | | The product with all variants (costs included), options, images and related products |
| `PATCH /api/admin/products/:id` | any product fields, `status`, flags, `images`, `relatedProducts`, `customFields` | Changes it; publish with `status: 'Published'` |
| `DELETE /api/admin/products/:id` | | Deletes it with its variants |
| `POST /api/admin/products/:id/variants` | variant fields with `options` such as `{ Size: 'L' }` | Adds a variant |
| `POST /api/admin/products/:id/variants/generate` | `{ options: { Size: ['S', 'M'], Colour: ['Red'] } }` | Creates every combination the product does not have yet (at most 100); see the library README |
| `PATCH`, `DELETE /api/admin/variants/:id` | variant fields | Changes or deletes a variant |
| `PATCH`, `DELETE /api/admin/options/:id` | `{ name }` | Renames or deletes an option (removed from every variant) |
| `PATCH`, `DELETE /api/admin/option-values/:id` | `{ value }` | Renames or deletes an option value |
| `GET`, `POST /api/admin/brands`, `.../categories`, `.../product-classes` | `q`, `active`, `page`, `size` | Lists (inactive ones included) or creates |
| `GET`, `PATCH`, `DELETE /api/admin/brands/:id` (and the same for categories and product classes) | | Shows, changes or deletes one |

Something still in use (an ordered product or variant, a brand, class or category with products, a category with subcategories) cannot be deleted: 409 with `data.code` `InUse`. Deactivate it instead.

### Offers

An offer is built from parts, created first: a range (which products), a condition on that range (when it applies) and a benefit (what the buyer gets). See the library README for what each condition and benefit type does. Body schemas are in `packages/api-admin/shared/utils/offers.ts`.

| Route | Body or query | Does |
|---|---|---|
| `GET`, `POST /api/admin/offer-ranges` | `q`, `active`, `page`, `size` / name, `includeAll…` flags, `inclusiveFilter`, `included…` and `excluded…` id lists | Lists or creates ranges. With `inclusiveFilter`, a product must match every list; without, any one. |
| `GET`, `PATCH`, `DELETE /api/admin/offer-ranges/:id` | | Shows (with the products, brands, categories and classes by name), changes (each list given replaces the old one) or deletes |
| `GET`, `POST /api/admin/offer-conditions` | `type`, `range` / `{ rangeId, type, value }` | Lists or creates conditions |
| `GET`, `PATCH`, `DELETE /api/admin/offer-conditions/:id` | `{ type?, value? }` | |
| `GET`, `POST /api/admin/offer-benefits` | `q`, `active`, `type` / `{ name, type, value, maxAffectedItems? }` | Lists or creates benefits |
| `GET`, `PATCH`, `DELETE /api/admin/offer-benefits/:id` | | |
| `GET`, `POST /api/admin/offers` | `q`, `type`, `active`, `featured`, `condition`, `benefit` / offer fields | Lists or creates site offers, user offers and vouchers |
| `GET`, `PATCH`, `DELETE /api/admin/offers/:id` | | Shows (with its condition and benefit), changes or deletes |

- A voucher needs a `voucherCode`, and other offers cannot have one (422). Codes are unique (409 `AlreadyExists`).
- A part still used cannot be deleted (409 `InUse`): delete the offer, then its benefit and condition, then the range. Orders keep their own copy of the offers they used, so deleting an offer does not change them.
- `usageCount` is not settable; checkout and cancelling keep it.

### Settings and shipping

Body schemas are in `packages/api-admin/shared/utils/settings.ts`.

| Route | Body | Does |
|---|---|---|
| `GET`, `PATCH /api/admin/settings/store` | any of `name`, `currency` (ISO code such as `USD`), `locale` (such as `en-US`) | Reads or changes the store settings; an unknown currency or locale gives 422 |
| `GET`, `PATCH /api/admin/settings/tax` | any of `pricesIncludeTax`, `defaultRate`, `taxShipping` | Reads or changes the tax settings; `PATCH` returns all of them. Placed orders keep their tax. |
| `GET`, `PATCH /api/admin/settings/loyalty` | any of `isEnabled`, `earnRate`, `redeemRate`, `expiresAfterInDays` | Reads or changes the loyalty settings. Points can be redeemed only while enabled with a `redeemRate`. |
| `GET`, `POST /api/admin/shipping-methods` | `{ name, price, metadata? }` | Lists (newest first) or creates shipping methods |
| `GET`, `PATCH`, `DELETE /api/admin/shipping-methods/:id` | | Shows, changes or deletes one. Placed orders keep their own copy of the method. |

### Orders and users

Body schemas are in `packages/api-admin/shared/utils/orders.ts`. Each change records the signed-in admin.

| Route | Body or query | Does |
|---|---|---|
| `GET /api/admin/orders` | `q` (order id, user id or part of the guest email), `status`, `tab` (`Active`, `Inactive`, `Cancelled`, `Completed`), `paymentStatus`, `userId`, `createdAt` (`YYYY-MM-DD`), `page`, `size` | Orders, newest first |
| `GET /api/admin/orders/:id` | | The order with its lines, payments and `logs` (what changed, when and by whom) |
| `POST /api/admin/orders/:id/status` | `{ status }` | Moves it to another status. Not `Cancelled` (400): cancel it instead. A cancelled order cannot change (422). |
| `POST /api/admin/orders/:id/cancel` | `{ reason, remarks? }` | Cancels it, giving back its offer usage and redeemed loyalty points |
| `POST /api/admin/orders/:id/payment-status` | `{ paymentStatus }` | Sets `Pending`, `Paid` or `Refunded` by hand, for example for cash on delivery |
| `GET /api/admin/users` | `q` (part of the email), `role` (`admin` or `user`), `page`, `size` | Customers and staff, newest first |
| `PATCH /api/admin/users/:id` | `{ role }` | Makes a user staff (`admin`) or a customer (`user`). You cannot remove your own admin role (422). |
| `POST /api/admin/users/:id/ban` | `{ reason?, days? }` | Bans a user (forever without `days`) and signs them out everywhere. You cannot ban yourself (400). |
| `POST /api/admin/users/:id/unban` | | Lifts a ban |

The user routes go through Better Auth's admin plugin; its errors keep their status and message.

## API errors

Wrap route handlers in `defineServiceHandler` so service errors become HTTP errors:

- `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError` and `CustomizationsNoLongerValidError` give 409, with the error name as `data.code` and the error's fields (such as `cartLineId`) in `data`.
- `NotFoundError` gives 404 and `ValidationError` gives 422, with the error's message.
- Database rules give Postgres's own detail as the message: a duplicate (such as a slug or SKU) gives 409 with `data.code` `AlreadyExists`; deleting a record that others still point at gives 409 `InUse`; pointing at a record that does not exist (such as a `categoryId`) gives 422 `MissingReference`.
- Anything else gives 500.

Unknown `/api` paths give a JSON 404.

The API has no authentication yet, so `/api/admin` is open. Don't deploy the backoffice until it does.

Other scripts at the repo root run the same command in `@awecommerce/service`.
