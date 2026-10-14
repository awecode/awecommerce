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

## Sign-in

Customers and staff sign in the same way, with a magic link, and share one `users` table. Staff are users with `role: 'admin'`; emails listed in `NUXT_AUTH_ADMIN_EMAILS` get it when they first sign in. Without SES settings, development prints the sign-in email to the console.

- Every `/api/admin` route needs an admin (401 signed out, 403 for customers), set in `packages/api-admin/server/middleware/admin.ts` rather than through an environment variable.
- The storefront's pages are public (`authRequiredByDefault: false`); a page that needs a customer sets `definePageMeta({ auth: true })`. The backoffice's pages need sign-in by default and send guests to `/login`.
- In routes, `getUser(event)`, `requireAuthenticated(event)` and `requireAdmin(event)` come from the auth layer (see `packages/auth/README.md`).
- The auth tables have their own `drizzle-kit` schema and migrations in `packages/auth` (`pnpm generate:auth`, `pnpm migrate:auth`), recorded in `__drizzle_migrations_auth`, apart from the library's.
- Its login components use Tailwind classes; the apps do not have Tailwind yet.

Changes from the upstream layer: it takes `useDb` from api-core, adds the auth tables to its schema, mounts the email template as `assets:auth` (so no copying into each app), sets the admin role from `NUXT_AUTH_ADMIN_EMAILS`, keeps the plugins' types (`role`, the magic link endpoints), and drops the demo pages.

`pnpm test:auth` runs the layer's own tests.

## Store API

### Catalog

Buyers see, and can buy, only listed products: active and `Published`, with an active brand and product class when set, and not under an inactive category at any depth (the library's `listedProduct` rule). They see only active variants, and never a variant's `inventoryCost` (not in product pages, not in the cart).

| Route | Does |
|---|---|
| `GET /api/store/products` | One page of products. Query: `q`, `categories` (ids, `1,2` or repeated; each includes its subcategories), `brands` (ids), `minPrice`, `maxPrice`, `sortBy` (`priceAsc` or `priceDesc`; newest first by default), `featured`, `bestSeller`, `page`, `size` (at most 100) |
| `GET /api/store/products/:slug` | A product with its active variants, options, images and listed related products |
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
| `GET /api/store/orders/:id?hash=` | | The order, for its confirmation page. A wrong hash gives 404. |

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
| `GET /api/store/loyalty` | | `{ canRedeem, redeemRate, points, value }`: the points that can be redeemed now and their worth |

The body schemas are in `packages/api-store/shared/utils/cart.ts` and `checkout.ts`, and are auto-imported in the apps too, for forms. A body of the wrong shape gives 400.

`pnpm test:api` runs the route tests: it builds the layer and calls it over HTTP, against a temporary Postgres (or `TEST_POSTGRES_URL`).

## API errors

Wrap route handlers in `defineServiceHandler` so service errors become HTTP errors:

- `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError` and `CustomizationsNoLongerValidError` give 409, with the error name as `data.code` and the error's fields (such as `cartLineId`) in `data`.
- `NotFoundError` gives 404 and `ValidationError` gives 422, with the error's message.
- Anything else gives 500.

Unknown `/api` paths give a JSON 404.

The API has no authentication yet, so `/api/admin` is open. Don't deploy the backoffice until it does.

Other scripts at the repo root run the same command in `@awecommerce/service`.
