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
pnpm dev              # storefront on http://localhost:3000, backoffice on http://localhost:3001
pnpm dev:storefront   # storefront only
pnpm dev:backoffice   # backoffice only
```

## Backoffice

`apps/backoffice` is the staff app: Nuxt UI 4 on Tailwind 4, an SPA (`ssr: false`), with data loaded through Pinia Colada.

- **Look:** zinc neutrals with a blue accent, Inter (bundled, no font service), compact controls (Nuxt UI's small sizes, set in `app/app.config.ts`), 48px headers. Light or dark follows the system and can be switched in the user menu.
- **Shell** (`app/layouts/default.vue`): collapsible, resizable sidebar with the store name, ⌘K (Ctrl+K) palette, and the user menu (appearance, sign out).
- **Sign-in:** `/login` (email, then a link or a pasted token), `/auth/confirm` (where the emailed link lands) and `/auth/error` replace the auth layer's pages. A signed-in user without the admin role gets `/no-access`.
- **Products** (`/products`): views (All, Drafts, Published, Inactive), search (`/` focuses it), category, brand and class filters, sorting by name, price or date, and the page, all in the URL. A product with one variant has its price, sale price and stock edited in place (click, then Enter to save or Escape to cancel); one with several shows its price range and total stock. The Columns menu shows or hides columns, remembered in the browser. Ticked rows get a bar to publish, unpublish, activate or deactivate them together. Arrow keys move through the rows and Enter opens one, when no button or field has focus.
- **Product page** (`/products/:id`, and `/products/new` from the list's New product button or ⌘K): name, rich text description and specification (Nuxt UI's editor, stored as HTML), images by URL (reorder, remove, choose the thumbnail), price and stock (a table once there are several variants), buyer input fields and related products; status, flags, category, brand, class, slug and link in the side column. Everything is saved together with Save or ⌘S (the product, then deleted, changed and new variants); Enter in a field does not save. Leaving with unsaved changes asks first, and Discard goes back to the saved version. Options (such as Size with S, M, L) generate a variant per missing combination; saved options and values are renamed or deleted from their menus. These change the saved product at once, so pending changes are saved first. The first image added becomes the thumbnail until another is chosen. A product that does not exist shows a not-found page. From 1536px wide, the product list sits beside the page.
- **Catalog** (`/catalog/categories`, `/catalog/brands`, `/catalog/product-classes`): one list page each, built on `app/components/catalog/CatalogPage.vue`. Search (`/` focuses it), the status filter and the page are kept in the URL. Rows open a side panel to edit; the slug fills itself from a new name; save with the button or ⌘S, and closing with unsaved changes asks first. The row menu activates, deactivates or deletes; deleting one that products still use offers to deactivate it instead. A category's parent picker leaves out the category and everything under it. `?new=1` opens a new one (the ⌘K palette links there).
- **Prices:** `useMoney()` formats decimal strings in the store's currency and locale (`/api/admin/settings/store`).

`pnpm test:backoffice` runs browser tests: it builds the app, starts it against a temporary Postgres, and drives Chromium (sign-in, staff and customer access, dark mode, the catalog screens, the product list and page). It uses Playwright's Chromium (install it with `pnpm --filter @awecommerce/backoffice exec playwright-core install chromium-headless-shell`) or, with `CHROMIUM_PATH` set (for example `CHROMIUM_PATH=/usr/bin/chromium`), a browser already on the machine.

## Storefront

`apps/storefront` is the shop: Nuxt UI 4 on Tailwind 4, server rendered, meant as a starter to copy and rebrand.

- **Look:** an editorial theme, near-black on warm white with stone greys, Fraunces for headings and prices and Inter for text (both bundled). Light only. The colours are at the top of `app/assets/css/main.css` and in `app/app.config.ts`.
- **Content without an admin screen yet** is in `app/app.config.ts` under `store`: `logo` (an image URL; the store name is shown without one), `tagline`, the default `description`, the home page `hero` (title, text, image, button) and the footer's `links`. The store's name, currency and locale come from the store settings (`/api/store/settings`).
- **Layout** (`app/layouts/default.vue`): the header has the name or logo, the category menu (top-level categories with a panel of their subcategories; a drawer on small screens), search (a dialog that goes to `/search?q=`), the account menu or Sign in, and the cart with its item count. The footer lists the top-level categories and the configured links.
- **Pages:**
  - `/`: the hero, shop by category (top-level categories, with their logo when set), then featured products and best sellers (the product flags).
  - `/categories/:slug` (its subcategories' products too, with links to them), `/brands/:slug` and `/search?q=`: a product grid with brand and price filters, sorting (newest, price up or down) and pages, all in the URL (`brands`, `minPrice`, `maxPrice`, `sort`, `page`). Filters sit beside the grid on wide screens and in a drawer on small ones. Search results are `noindex`.
  - `/products/:slug`: images, the price (sale price struck through), option pickers (sold-out values crossed out; the picked variant is kept in the URL as `?variant=`), stock (`In stock`, `Only 3 left`, `Sold out`), the buyer's answers to the product's fields, quantity and Add to cart, the description and specification, and related products. Its tags include the product image and `og:type` product, and Product JSON-LD (an `Offer`, or an `AggregateOffer` for several prices).
  - Unknown categories, brands and products give a real 404, shown by `app/error.vue`.
  - The cart drawer slides in after Add to cart and from the header's cart button: the lines (quantity and Remove), the subtotal and discounts, Checkout and View cart.
  - `/cart`: the lines with their options and answers, quantity and Remove; warnings that block checkout (no longer for sale, more than in stock, product fields changed); vouchers; and the summary (subtotal, offer and voucher discounts, tax, total). `noindex`.
  - `/checkout`: one page with contact (guests give name and email; members see who they are signed in as), the delivery address (members pick a saved one or add a new one, saved after the order is placed), the delivery method (the cheapest first), loyalty points (members, previewed in the total) and payment (Pay on delivery), beside the summary. The order is placed for the total shown: if it changed, the new total is shown to confirm; stock, voucher and availability problems link back to the cart.
  - `/orders/:id?hash=`: the confirmation after checkout (the link works for whoever has it), with the address, delivery, payment, items and totals. Without the hash, it is the signed-in owner's order page.
- **Composables:** `useStoreSettings()`, `useMoney()` (prices in the store's currency and locale), `useCategories()`, `useBrands()`, `useCategoryMenu()` and `useCart()` (the cart summary, its item count, the drawer's state, and `add`, `setQuantity`, `remove`, `applyVoucher` and `removeVoucher`, which store the summary the API answers with). Shared data is fetched once per page under one key (`dedupe: 'defer'`).
- **SEO defaults** (`app/app.vue`): titles as `Page · Store`, the default description, Open Graph and Twitter tags, `<html lang>` from the store's locale, and a canonical link without the query, built from `NUXT_PUBLIC_SITE_URL` (the request's address when unset).

`pnpm test:storefront` runs its browser tests, like the backoffice's (same Chromium setup), one file at a time, as some change the store settings that others check prices against.

## Sign-in

Customers and staff sign in the same way, with a magic link, and share one `users` table. Staff are users with `role: 'admin'`; emails listed in `NUXT_AUTH_ADMIN_EMAILS` get it when they first sign in. Without SES settings, development prints the sign-in email to the console.

- Every `/api/admin` route needs an admin (401 signed out, 403 for customers), set in `packages/api-admin/server/middleware/admin.ts` rather than through an environment variable.
- The storefront's pages are public (`authRequiredByDefault: false`); a page that needs a customer sets `definePageMeta({ auth: true })`. The backoffice's pages need sign-in by default and send guests to `/login`.
- In routes, `getUser(event)`, `requireAuthenticated(event)` and `requireAdmin(event)` come from the auth layer (see `packages/auth/README.md`).
- To run code after every sign-in, call `onSignedIn(({ user }) => ...)` from a Nitro plugin. The store uses it to link the orders a buyer placed as a guest with the same email (`packages/api-store/server/plugins/claim-guest-orders.ts`), only when that email is verified, which magic link sign-in does.
- The auth tables have their own `drizzle-kit` schema and migrations in `packages/auth` (`pnpm generate:auth`, `pnpm migrate:auth`), recorded in `__drizzle_migrations_auth`, apart from the library's.
- Its login components use Tailwind classes. The storefront uses the layer's sign-in pages for now; the backoffice has its own.

Changes from the upstream layer: it takes `useDb` from api-core, adds the auth tables to its schema, mounts the email template as `assets:auth` (so no copying into each app), sets the admin role from `NUXT_AUTH_ADMIN_EMAILS`, keeps the plugins' types (`role`, the magic link endpoints), and drops the demo pages.

`pnpm test:auth` runs the layer's own tests.

## Store API

### Catalog

Buyers see, and can buy, only listed products: active and `Published`, with an active brand and product class when set, and not under an inactive category at any depth (the library's `listedProduct` rule). They see only active variants, and never a variant's `inventoryCost` (not in product pages, not in the cart).

| Route | Does |
|---|---|
| `GET /api/store/products` | One page of products, each with `inStock`. Query: `q`, `categories` (ids, `1,2` or repeated; each includes its subcategories), `brands` (ids), `minPrice`, `maxPrice`, `sortBy` (`priceAsc` or `priceDesc`; newest first by default), `featured`, `bestSeller`, `page`, `size` (at most 100) |
| `GET /api/store/products/:slug` | A product with its active variants (each with `inStock`), options, images and listed related products (as product list rows, with prices and stock, for product cards) |
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

Adding more than is in stock, or raising a quantity past it, gives 409 with `data.code` `OutOfStockError` and `data.available`. Each line in the summary has `isInStock` and `stockLeft`; warn while `isInStock` is false (see Stock in the library README).

### Checkout

| Route | Body | Does |
|---|---|---|
| `GET /api/store/shipping-methods` | | The shipping methods |
| `POST /api/store/checkout` | `{ shippingMethodId?, expectedTotal, shippingAddress or shippingAddressId, guestUser?, redeemPoints?, paymentMethod? }` | Places the order and clears the cart cookie. Returns the order with its `hash`. `paymentMethod` is `pay_on_delivery` (the default and, for now, the only one), stored as the order's `metadata.paymentMethod`. |
| `GET /api/store/orders/:id?hash=` | | The order, for its confirmation page, for whoever holds the link. A wrong hash gives 404. |

- `expectedTotal` is the cart summary's `total` the buyer confirmed (with the same `shippingMethodId`). If the order would cost anything else, checkout gives 409 with `data.code` `OrderTotalMismatchError` and `data.actualTotal`, and the cart stays as it is.
- The other 409s: `OutOfStockError`, `VoucherNoLongerValidError`, `OfferLimitReachedError` and `CustomizationsNoLongerValidError`, with their fields in `data` (see the library README). Reload the cart and show the buyer what changed.
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
| `GET /api/admin/products` | `q`, `status`, `active`, `categories`, `brands`, `productClass`, `featured`, `bestSeller`, `sortBy` (`newest`, `oldest`, `nameAsc`, `nameDesc`, `priceAsc`, `priceDesc`), `page`, `size` | Every product, drafts, inactive ones and those under inactive brands, categories or classes included. A category in `categories` also matches the categories under it. Each row has `minPrice`, `maxPrice`, `variantCount`, `totalStock` and, for a product with one variant, `singleVariant` (its id, SKU, prices and stock, for editing in place). |
| `POST /api/admin/products/bulk` | `{ ids, changes }` with any of `status`, `isActive`, `isFeatured`, `isBestSeller` | Changes up to 100 products at once: all, or none when one is missing (404) |
| `POST /api/admin/products` | product fields, plus the first variant's `sku`, `price`, `discountedPrice`, `inventoryCost`, `stockQuantity` | Creates a product (as `Draft`) with its first variant |
| `GET /api/admin/products/:id` | | The product with all variants (costs included), options, images and related products |
| `PATCH /api/admin/products/:id` | any product fields, `status`, flags, `images`, `relatedProducts`, `customFields` | Changes it; publish with `status: 'Published'` |
| `DELETE /api/admin/products/:id` | | Deletes it with its variants |
| `POST /api/admin/products/:id/variants` | variant fields with `options` such as `{ Size: 'L' }` | Adds a variant |
| `POST /api/admin/products/:id/variants/generate` | `{ options: { Size: ['S', 'M'], Colour: ['Red'] } }` | Creates every combination the product does not have yet (at most 100); see the library README |
| `PATCH`, `DELETE /api/admin/variants/:id` | variant fields | Changes or deletes a variant |
| `PATCH`, `DELETE /api/admin/options/:id` | `{ name }` | Renames or deletes an option (removed from every variant; 422 while more than one of its values is in use) |
| `PATCH`, `DELETE /api/admin/option-values/:id` | `{ value }` | Renames or deletes an option value; deleting also deletes the variants that have it (409 if one was ordered, 422 if none would be left) |
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

- `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError`, `CustomizationsNoLongerValidError` and `OutOfStockError` give 409, with the error name as `data.code` and the error's fields (such as `cartLineId`) in `data`.
- `NotFoundError` gives 404 and `ValidationError` gives 422, with the error's message.
- Database rules give Postgres's own detail as the message: a duplicate (such as a slug or SKU) gives 409 with `data.code` `AlreadyExists`; deleting a record that others still point at gives 409 `InUse`; pointing at a record that does not exist (such as a `categoryId`) gives 422 `MissingReference`.
- Anything else gives 500.

Unknown `/api` paths give a JSON 404.

Other scripts at the repo root run the same command in `@awecommerce/service`.
