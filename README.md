# awecommerce

Monorepo for Awecommerce: the library, the API layers, and the storefront and backoffice apps.

| Package | Path | Role |
|---|---|---|
| `@awecommerce/service` | `packages/service` | Headless e-commerce library for Node.js and PostgreSQL |
| `@awecommerce/api-core` | `packages/api-core` | Nuxt layer: database pool (`useDb`), service error mapping (`defineServiceHandler`), `/health` |
| `@awecommerce/api-store` | `packages/api-store` | Nuxt layer: storefront API under `/api/store`, extends api-core |
| `@awecommerce/api-admin` | `packages/api-admin` | Nuxt layer: backoffice API under `/api/admin`, extends api-core |
| `@awecommerce/storefront` | `apps/storefront` | Nuxt app (SSR), extends api-store |
| `@awecommerce/backoffice` | `apps/backoffice` | Nuxt app (SPA), extends api-admin |

Each app extends one API layer, so it serves only that API and `useFetch` knows each route's response type. The admin API is not part of the storefront.

## Run the apps

Each app reads the database from `NUXT_POSTGRES_URL` (see the app's `.env.example`). Migrate the database first with `pnpm migrate` (see [packages/service/README.md](packages/service/README.md)).

```sh
pnpm dev:storefront
pnpm dev:backoffice
```

## Store API

### Catalog

Buyers see only products that are active and `Published`, only active variants, and never a variant's `inventoryCost` (not in product pages, not in the cart).

| Route | Does |
|---|---|
| `GET /api/store/products` | One page of products. Query: `q`, `categories` and `brands` (ids, `1,2` or repeated), `minPrice`, `maxPrice`, `sortBy` (`priceAsc` or `priceDesc`; newest first by default), `featured`, `bestSeller`, `page`, `size` (at most 100) |
| `GET /api/store/products/:slug` | A product with its active variants, options, images and listed related products |
| `GET /api/store/categories` | Active categories, each with its `parent` |
| `GET /api/store/brands` | Active brands that have active products |

The query schema is `productListQuery` in `packages/api-store/shared/utils/catalog.ts`.

### Cart

The cart is found by the `awe_cart` cookie (httpOnly), which holds the cart's `sessionId`. It is set on the first add; a checked-out cart counts as no cart, so the next add starts a new one. Every change returns the cart summary (`CartService.getCartSummary`).

| Route | Body | Does |
|---|---|---|
| `GET /api/store/cart?shippingMethodId=` | | The cart summary, with that method's charge and tax when given, or 204 with no body before the first add |
| `POST /api/store/cart/lines` | `{ variantId, quantity, customizations? }` | Adds a variant, creating the cart |
| `PATCH /api/store/cart/lines/:id` | `{ quantity?, customizations? }` | Changes the line; both or neither are saved |
| `DELETE /api/store/cart/lines/:id` | | Removes the line |
| `POST /api/store/cart/vouchers` | `{ code }` | Applies a voucher |
| `DELETE /api/store/cart/vouchers/:code` | | Removes a voucher |

Checkout is for guests until sign-in exists:

| Route | Body | Does |
|---|---|---|
| `GET /api/store/shipping-methods` | | The shipping methods |
| `POST /api/store/checkout` | `{ shippingMethodId?, expectedTotal, shippingAddress, guestUser }` | Places the order and clears the cart cookie. Returns the order with its `hash`. |
| `GET /api/store/orders/:id?hash=` | | The order, for its confirmation page. A wrong hash gives 404. |

- `expectedTotal` is the cart summary's `total` the buyer confirmed (with the same `shippingMethodId`). If the order would cost anything else, checkout gives 409 with `data.code` `OrderTotalMismatchError` and `data.actualTotal`, and the cart stays as it is.
- The other 409s: `VoucherNoLongerValidError`, `OfferLimitReachedError` and `CustomizationsNoLongerValidError`, with their fields in `data` (see the library README). Reload the cart and show the buyer what changed.
- `shippingAddress` needs `line1`, `city` and `country`; `line2`, `houseNo`, `province`, `postalCode`, `countryCode` and `instructions` are optional. `guestUser` needs `name` and `email`; `phone` is optional. Other fields are dropped.
- The storefront needs `ORDER_HASH_SECRET` (see its `.env.example`) to sign order links.

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
