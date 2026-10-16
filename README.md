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

Each app reads its settings from the environment (see the app's `.env.example`): the database (`NUXT_POSTGRES_URL`), its public URL (`BETTER_AUTH_URL`) and `BETTER_AUTH_SECRET`. The storefront also needs `NUXT_PAYMENT_METHODS` (such as `cash_on_delivery,pay_later`): no payment method is on by default, and without one no order can be placed (see Payments). Migrate the database first, for the library's tables and the auth tables:

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

### Database connections, on Node and Cloudflare Workers

`useDb()` (`packages/api-core/server/utils/db.ts`) works on both, from the same build settings:

- **Node:** one connection pool for the server, from `NUXT_POSTGRES_URL`.
- **Cloudflare Workers** (`NITRO_PRESET=cloudflare-module`): a connection cannot be used by another request there, so each request gets a small pool of its own (at most 5 connections), closed after the response. It connects through a Hyperdrive binding named `HYPERDRIVE` when there is one (on the request, Nitro's `__env__` or global), and through `NUXT_POSTGRES_URL` otherwise. Outside a request, such as in a scheduled task, each call gets its own connection.
- **What makes it work:** Nitro's async context (`nitro.experimental.asyncContext`), so `useDb()` finds the current request without being passed it. Also `pg-native` and `cloudflare:sockets` marked external, and Node.js compatibility on, all set in api-core. The Worker needs `compatibility_flags = ["nodejs_compat"]`.
- **Hyperdrive:** create it with caching off (`npx wrangler hyperdrive create <name> --connection-string=... --caching-disabled`). Cached reads would show carts, stock, voucher usage and memberships from before the last change. In `wrangler.toml`:

```toml
compatibility_flags = ["nodejs_compat"]

[[hyperdrive]]
binding = "HYPERDRIVE"
id = "<the Hyperdrive id>"
# For wrangler dev: localConnectionString = "postgres://user:password@localhost:5432/shop"
```

The store API tests check the Workers path on Node: every request is made to look like a Workers request with a Hyperdrive binding (`packages/api-store/tests/workers-app`), and `NUXT_POSTGRES_URL` points nowhere.

## Backoffice

`apps/backoffice` is the staff app: Nuxt UI 4 on Tailwind 4, an SPA (`ssr: false`), with data loaded through Pinia Colada.

- **Look:** zinc neutrals with a blue accent, Inter (bundled, no font service), compact controls (Nuxt UI's small sizes, set in `app/app.config.ts`), 48px headers. Light or dark follows the system and can be switched in the user menu.
- **Shell** (`app/layouts/default.vue`): collapsible, resizable sidebar with the store name, ⌘K (Ctrl+K) palette, and the user menu (appearance, sign out).
- **Sign-in:** `/login` (email, then a link or a pasted token), `/auth/confirm` (where the emailed link lands) and `/auth/error` replace the auth layer's pages. A signed-in user without the admin role gets `/no-access`.
- **Products** (`/products`): views (All, Drafts, Published, Inactive), search (`/` focuses it), category, brand and class filters, sorting by name, price or date, and the page, all in the URL. A product with one variant has its price, sale price and stock edited in place (click, then Enter to save or Escape to cancel); one with several shows its price range and total stock. The Columns menu shows or hides columns, remembered in the browser. Ticked rows get a bar to publish, unpublish, activate or deactivate them together. Arrow keys move through the rows and Enter opens one, when no button or field has focus.
- **Product page** (`/products/:id`, and `/products/new` from the list's New product button or ⌘K): name, rich text description and specification (Nuxt UI's editor, stored as HTML), images (chosen as files, reorder, remove, choose the thumbnail; see Product images), price and stock (a table once there are several variants), buyer input fields and related products; status, flags, category, brand, class, slug and link in the side column. Everything is saved together with Save or ⌘S (the product, then deleted, changed and new variants); Enter in a field does not save. Leaving with unsaved changes asks first, and Discard goes back to the saved version. Options (such as Size with S, M, L) generate a variant per missing combination; saved options and values are renamed or deleted from their menus. These change the saved product at once, so pending changes are saved first. A product that does not exist shows a not-found page. From 1536px wide, the product list sits beside the page.
- **Catalog** (`/catalog/categories`, `/catalog/brands`, `/catalog/product-classes`): one list page each, built on `app/components/catalog/CatalogPage.vue`. Search (`/` focuses it), the status filter and the page are kept in the URL. Rows open a side panel to edit; the slug fills itself from a new name; save with the button or ⌘S, and closing with unsaved changes asks first. The row menu activates, deactivates or deletes; deleting one that products still use offers to deactivate it instead. A category's parent picker leaves out the category and everything under it. A product class has a Ships to the buyer switch, off for digital goods (see Digital goods). `?new=1` opens a new one (the ⌘K palette links there).
- **Orders** (`/orders`, first in the sidebar): views (To do, the orders not completed or cancelled; All; Completed; Cancelled), search (order number, customer email or name), status, payment and day filters, and the page, all in the URL. Each row shows the customer (marked Guest when they had no account), items, total, status and payment. The order page (`/orders/:id`) has the items and totals (offers, vouchers, points, delivery, tax), the customer (with a link to their orders), the delivery address and method, payment, and the history with who did what. Its main button is the usual next status (Confirm order, Start processing, Mark shipped, Mark delivered, Complete; for an order with nothing to ship, Confirm order, then Complete, with Nothing to ship in place of the delivery address and method); the menu moves it to any other status or cancels it, asking for a reason. Payment is marked paid or refunded by hand.
- **Offers** (`/offers`, after Products): views (Running, Scheduled, Ended, Inactive, All), type and search in the URL; each row shows what it gives and when ("15% off when a product reaches 2 units"), its dates, how often it was used and whether it is active. The offer page (`/offers/:id`, and `/offers/new` from New offer or ⌘K) is one form, saved with Save or ⌘S like the product page: name, type (Automatic for every cart, Customers, or Voucher with its code) and description; who gets it (every signed-in customer, or chosen customers and members of plans); products (every product, or any of chosen products, categories, brands and classes, with Except lists; a category covers its subcategories); when it applies and what it gives; and, in the side column, active, schedule, limits with the use so far, "Combines with other offers", priority, featured and an image (uploaded on save, like product images). A sentence at the top says what the offer does as it is edited. Delete is in the page menu. An offer whose range was made through the range routes in a way the form cannot show keeps it as it is.
- **Memberships** (a sidebar group): `/memberships/plans` lists plans on the catalog list page (search, active filter, side panel), with program, rank and description; a saved plan's panel also lists the product variants that sell it (pick a product, then its variant, and the months), added and removed at once. An inactive plan cannot be granted or bought; current members keep theirs. `/memberships` (Members) lists memberships, latest start first, with search (member email or name), plan and state (active, upcoming, ended, cancelled) filters and the page in the URL; each row shows where it came from (an order, or the staff member who granted it). Grant membership picks a customer, an active plan and months. A row opens the member's history, with Extend (a new membership of the same plan that starts when the current one ends) and Cancel (with a reason) for running and upcoming ones. ⌘K has New membership plan and Grant membership.
- **Settings** (a sidebar group): `/settings/store` (store name; currency from the codes the server accepts, with a note that prices are relabelled, not converted; locale, with a sample price), `/settings/tax` (prices include tax, default rate, tax on shipping), `/settings/loyalty` (on or off, points per amount spent, the value of a point at checkout and the days until points expire, with an example such as "Spending $100.00 earns 100 points, worth $1.00 at checkout"; points are awarded by the app, never automatically) and `/settings/shipping` (shipping methods: name and price, added and edited in a side panel, deleted after a confirm; orders keep their own copy). Store, tax and loyalty save explicitly (the button or ⌘S, Discard, a warning when leaving with changes), through `useSettingsForm()`; saving the store refreshes the sidebar name and price formatting.
- **Customers** (`/customers`, after Offers): views (Customers, Staff, Banned, All), search by email and the page in the URL. Add staff (also in ⌘K) takes an email: that account becomes staff, or one is made with the staff role, and they sign in with the emailed link. A person's page (`/customers/:id`) has their 5 latest orders (with a link to all of them in Orders), memberships (grant, extend and cancel there), saved addresses (read-only), redeemable loyalty points and account details; its menu changes the name, makes or removes staff, and bans (with a reason) or lifts a ban. Each action saves at once; you cannot remove your own staff role.
- **⌘S in number fields:** a number field keeps what is typed until it loses focus, so every ⌘S handler calls `commitFocusedField()` (`app/utils/commitField.ts`) before saving: the focused field is blurred, so its value counts, and focused again. New forms with ⌘S should do the same.
- **Prices:** `useMoney()` formats decimal strings in the store's currency and locale (`/api/admin/settings/store`).
- **Typed API calls:** `apiGet('/api/admin/…')`, `apiPost(…)` and `apiGetAt('/api/admin/orders/:id', path)` (`app/utils/api.ts`) type a response by the route's exact path. Nitro's typed `$fetch` matches a path against every route, which goes past TypeScript's depth limit (TS2321) with this many routes, so use these instead of `$fetch('/api/…')`.

`pnpm test:backoffice` runs browser tests: it builds the app, starts it against a temporary Postgres, and drives Chromium (sign-in, staff and customer access, dark mode, the catalog screens, the product list and page, orders, offers, customers, product images, memberships and settings), one file at a time, as the settings tests change the currency that others check prices against. It uses Playwright's Chromium (install it with `pnpm --filter @awecommerce/backoffice exec playwright-core install chromium-headless-shell`) or, with `CHROMIUM_PATH` set (for example `CHROMIUM_PATH=/usr/bin/chromium`), a browser already on the machine.

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
  - The cart drawer slides in after Add to cart and from the header's cart button: the lines (quantity and Remove), the subtotal and discounts, Checkout and View cart. It says Nothing to ship when nothing in the cart is shipped, as does the cart page.
  - `/cart`: the lines with their options and answers, quantity and Remove; warnings that block checkout (no longer for sale, more than in stock, product fields changed); vouchers; and the summary (subtotal, offer and voucher discounts, tax, total). `noindex`.
  - `/checkout`: one page with contact (guests give name and email; members see who they are signed in as), the delivery address (members pick a saved one or add a new one, saved after the order is placed; the first one saved becomes the default), the delivery method (the cheapest first), loyalty points (members, previewed in the total) and payment (Pay on delivery), beside the summary. A cart with nothing to ship has no address or delivery method, and pays later ("We will contact you to arrange payment"). The order is placed for the total shown: if it changed, the new total is shown to confirm; stock, voucher and availability problems link back to the cart.
  - `/orders/:id?hash=`: the confirmation after checkout (the link works for whoever has it), with the address, delivery, payment, items and totals, and each line's fulfilment note (see Digital goods). An order with nothing to ship has no address or delivery. Without the hash, it is the signed-in owner's order page (guests are sent to sign in first).
  - Sign-in: `/login` (email, then the emailed link or the pasted token), `/auth/confirm` (where the link lands) and `/auth/error`, in the shop's look; they replace the auth layer's pages. The header's and checkout's Sign in links bring the buyer back to the same page (`?redirect=`).
  - `/account` (sign-in needed): the overview with memberships (when there are any), loyalty points, recent orders and the default address; `/account/orders` (every order, a page at a time); `/account/memberships` (current plans with Renew, then the history); `/account/addresses` (add, edit, make default, delete). The address fields are shared with checkout (`AddressFields`).
- **Composables:** `useStoreSettings()`, `useMoney()` (prices in the store's currency and locale), `useCategories()`, `useBrands()`, `useCategoryMenu()` and `useCart()` (the cart summary, its item count, the drawer's state, and `add`, `setQuantity`, `remove`, `applyVoucher` and `removeVoucher`, which store the summary the API answers with). Shared data is fetched once per page under one key (`dedupe: 'defer'`).
- **Scrolling** (`app/router.options.ts`): a new page, or another page of results, starts at the top; changing filters or sorting keeps the place; a hash scrolls to its element only when it is an element id (the sign-in link carries its token in the hash).
- **SEO defaults** (`app/app.vue`): titles as `Page · Store`, the default description, Open Graph and Twitter tags, `<html lang>` from the store's locale, and a canonical link without the query, built from `NUXT_PUBLIC_SITE_URL` (the request's address when unset).

`pnpm test:storefront` runs its browser tests, like the backoffice's (same Chromium setup), one file at a time, as some change the store settings that others check prices against.

## Sign-in

Customers and staff sign in the same way, with a magic link, and share one `users` table. Staff are users with `role: 'admin'`; emails listed in `NUXT_AUTH_ADMIN_EMAILS` get it when they first sign in. Without SES settings, development prints the sign-in email to the console.

- Every `/api/admin` route needs an admin (401 signed out, 403 for customers), set in `packages/api-admin/server/middleware/admin.ts` rather than through an environment variable.
- The storefront's pages are public (`authRequiredByDefault: false`); a page that needs a customer sets `definePageMeta({ auth: true })`. The backoffice's pages need sign-in by default and send guests to `/login`.
- In routes, `getUser(event)`, `requireAuthenticated(event)` and `requireAdmin(event)` come from the auth layer (see `packages/auth/README.md`).
- To run code after every sign-in, call `onSignedIn(({ user }) => ...)` from a Nitro plugin. The store uses it to link the orders a buyer placed as a guest with the same email (`packages/api-store/server/plugins/claim-guest-orders.ts`), only when that email is verified, which magic link sign-in does.
- The auth tables have their own `drizzle-kit` schema and migrations in `packages/auth` (`pnpm generate:auth`, `pnpm migrate:auth`), recorded in `__drizzle_migrations_auth`, apart from the library's.
- Its login components use Tailwind classes. Both apps have their own sign-in pages, in their own look.

Changes from the upstream layer: it takes `useDb` from api-core, adds the auth tables to its schema, mounts the email template as `assets:auth` (so no copying into each app), sets the admin role from `NUXT_AUTH_ADMIN_EMAILS`, keeps the plugins' types (`role`, the magic link endpoints), and drops the demo pages.

`pnpm test:auth` runs the layer's own tests.

## Store API

### Catalog

Buyers see, and can buy, only listed products: active and `Published`, with an active brand and product class when set, and not under an inactive category at any depth (the library's `listedProduct` rule). They see only active variants, and never a variant's `inventoryCost` (not in product pages, not in the cart).

| Route | Does |
|---|---|
| `GET /api/store/products` | One page of products, each with `inStock`. Query: `q`, `categories` (ids, `1,2` or repeated; each includes its subcategories), `brands` (ids), `minPrice`, `maxPrice`, `sortBy` (`priceAsc` or `priceDesc`; newest first by default), `featured`, `bestSeller`, `page`, `size` (at most 100) |
| `GET /api/store/products/:slug` | A product with its active variants (each with `inStock` and `memberPrice`; see Memberships), options, images and listed related products (as product list rows, with prices and stock, for product cards) |
| `GET /api/store/settings` | The store's `name`, `currency` and `locale`, for showing prices |
| `GET /api/store/categories` | Active categories with a listed product in them or below them, each with its `parent`. Categories under an inactive category are left out. |
| `GET /api/store/brands` | Active brands with a listed product |

The query schema is `productListQuery` in `packages/api-store/shared/utils/catalog.ts`.

### Cart

The cart is found by the `awe_cart` cookie (httpOnly), which holds the cart's `sessionId`. It is set on the first add; a checked-out cart counts as no cart, so the next add starts a new one.

Signed in, the buyer gets their own open cart on every device. A guest cart still in the cookie is merged into it the first time they are seen signed in (same items add up), and the cookie is pointed at the account cart. After signing out, the cookie no longer shows that cart: a cart that belongs to a user is only shown to that user. Every change returns the cart summary (`CartService.getCartSummary`).

| Route | Body | Does |
|---|---|---|
| `GET /api/store/cart?shippingMethodId=&redeemPoints=` | | The cart summary, with that method's charge and tax, and the value of those loyalty points (signed in), when given, or 204 with no body before the first add. `requiresShipping` (on the cart and each line) is false for digital goods; a cart with nothing to ship takes no shipping method (422). |
| `POST /api/store/cart/lines` | `{ variantId, quantity, customizations? }` | Adds a variant, creating the cart |
| `PATCH /api/store/cart/lines/:id` | `{ quantity?, customizations? }` | Changes the line; both or neither are saved |
| `DELETE /api/store/cart/lines/:id` | | Removes the line |
| `POST /api/store/cart/vouchers` | `{ code }` | Applies a voucher |
| `DELETE /api/store/cart/vouchers/:code` | | Removes a voucher |

Adding more than is in stock, or raising a quantity past it, gives 409 with `data.code` `OutOfStockError` and `data.available`. Each line in the summary has `isInStock` and `stockLeft`; warn while `isInStock` is false (see Stock in the library README). `requiresAccount` is true when the cart has a membership (checkout then needs sign-in), and `notCombinedVoucherOffers` lists applied vouchers that give nothing because a bigger discount does not combine with them; they can still be removed.

### Checkout

| Route | Body | Does |
|---|---|---|
| `GET /api/store/shipping-methods` | | The shipping methods |
| `GET /api/store/payment-methods` | | The payment methods for the buyer's cart, in the store's order: `{ id, label, description, online }` (see Payments). Empty when none is set up. |
| `POST /api/store/checkout` | `{ shippingMethodId?, expectedTotal, shippingAddress or shippingAddressId, guestUser?, redeemPoints?, paymentMethod? }` | Places the order, runs the placed fulfilment hooks and clears the cart cookie. Returns the order with its `hash` and `payment: { redirectUrl }`. `paymentMethod` is one of the payment methods' `id`s (optional when there is only one; 422 for one the cart cannot use, and `Payments are not set up yet` when there is none), stored as the order's `paymentMethod`. For an online one, the payment is started: send the buyer to `redirectUrl` (null if it could not be started; the order is placed either way, and its page offers Pay now). |
| `GET /api/store/orders/:id?hash=` | | The order, for its confirmation page, for whoever holds the link, with each line's fulfilment `note` (or `null`) and its `payment` (see Payments). A wrong hash gives 404. |
| `POST /api/store/orders/:id/pay` | `{ paymentMethod, hash? }` | Pay now, for an unpaid order with an online method (`payment.canPay`): any of its `payment.methods`. Returns `{ redirectUrl }`: the gateway, or null when an offline method was chosen (the order is switched to it). 422 when the order cannot be paid now. |
| `POST /api/store/orders/:id/payment-check` | `{ hash? }` | While the latest payment try is open: asks the gateway how it went, and acts on it. Returns the order's `payment`. |

- `expectedTotal` is the cart summary's `total` the buyer confirmed (with the same `shippingMethodId`). If the order would cost anything else, checkout gives 409 with `data.code` `OrderTotalMismatchError` and `data.actualTotal`, and the cart stays as it is.
- The other 409s: `OutOfStockError`, `VoucherNoLongerValidError`, `OfferLimitReachedError` and `CustomizationsNoLongerValidError`, with their fields in `data` (see the library README). Reload the cart and show the buyer what changed.
- `shippingAddress` needs `line1`, `city` and `country`; `line2`, `houseNo`, `province`, `postalCode`, `countryCode` and `instructions` are optional. Signed-in buyers can pass `shippingAddressId` (one of their saved addresses) instead; its fields are copied onto the order. Pass one of the two when the cart has something to ship (422 without); for a cart with nothing to ship, neither is needed, and one given is not kept.
- Guests must pass `guestUser` (`name` and `email`; `phone` is optional). A cart with a membership needs a signed-in buyer: guests get 422 `Sign in to buy a membership`. Signed in, the order belongs to the user and `guestUser` is ignored.
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
| `GET /api/store/memberships` | | `{ current, history }`. `current`: each plan the buyer holds, waits for, or held until the last 90 days (`state` `active`, `upcoming` or `ended`, `startsAt`, `endsAt`), with the `terms` on sale to renew it (`variantId`, `months`, `price`). `history`: every membership, latest start first, with its `state`. |

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
| `POST /api/admin/product-images` | multipart form: `file` and the product's `slug` | Stores a product image and answers `{ key, url }`; see Product images |
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

An offer is built from parts: a range (which products), a condition on that range (when it applies) and a benefit (what the buyer gets). The with-parts routes save an offer and its own parts in one go, as the backoffice's offer form does; the part routes build them one by one. See the library README for what each condition and benefit type does. Body schemas are in `packages/api-admin/shared/utils/offers.ts`.

| Route | Body or query | Does |
|---|---|---|
| `GET`, `POST /api/admin/offer-ranges` | `q`, `active`, `page`, `size` / name, `includeAll…` flags, `inclusiveFilter`, `included…` and `excluded…` id lists | Lists or creates ranges. With `inclusiveFilter`, a product must match every list; without, any one. |
| `GET`, `PATCH`, `DELETE /api/admin/offer-ranges/:id` | | Shows (with the products, brands, categories and classes by name), changes (each list given replaces the old one) or deletes |
| `GET`, `POST /api/admin/offer-conditions` | `type`, `range` / `{ rangeId, type, value }` | Lists or creates conditions |
| `GET`, `PATCH`, `DELETE /api/admin/offer-conditions/:id` | `{ type?, value? }` | |
| `GET`, `POST /api/admin/offer-benefits` | `q`, `active`, `type` / `{ name, type, value, maxAffectedItems? }` | Lists or creates benefits |
| `GET`, `PATCH`, `DELETE /api/admin/offer-benefits/:id` | | |
| `POST /api/admin/offers/with-parts` | offer fields, plus `products` (`{ all, products?, categories?, brands?, productClasses?, except? }` with id lists), `condition` (`{ type, value }`) and `benefit` (`{ type, value, maxAffectedItems? }`) | Creates the offer with its own range, condition and benefit, all or nothing |
| `GET`, `PATCH`, `DELETE /api/admin/offers/:id/with-parts` | the same fields, each optional | Shows the offer with its condition, benefit, `products` (with names; null when the range is one the form cannot show) and `includedUsers` (with emails); changes it and the parts given (a part another offer shares is copied first); or deletes it with the parts no other offer uses |
| `GET`, `POST /api/admin/offers` | `q`, `type`, `active`, `featured`, `condition`, `benefit`, `state` (`running`, `scheduled`, `ended`, by dates) / offer fields | Lists offers, newest first, each with its `benefit` and `condition` (type and value), or creates one from existing parts |
| `GET`, `PATCH`, `DELETE /api/admin/offers/:id` | | Shows (with its condition and benefit), changes or deletes |

- A voucher needs a `voucherCode`, and other offers cannot have one (422). Codes are unique (409 `AlreadyExists`).
- A part still used cannot be deleted (409 `InUse`): delete the offer, then its benefit and condition, then the range. Orders keep their own copy of the offers they used, so deleting an offer does not change them.
- `usageCount` is not settable; checkout and cancelling keep it.
- `includedMembershipPlanIds` makes a user offer or voucher also for members of those plans, and `combinesWithOtherOffers: false` keeps an offer from adding to others (see the library README).

### Settings and shipping

Body schemas are in `packages/api-admin/shared/utils/settings.ts`.

| Route | Body | Does |
|---|---|---|
| `GET`, `PATCH /api/admin/settings/store` | any of `name`, `currency` (ISO code such as `USD`), `locale` (such as `en-US`) | Reads or changes the store settings; an unknown currency or locale gives 422 |
| `GET`, `PATCH /api/admin/settings/tax` | any of `pricesIncludeTax`, `defaultRate`, `taxShipping` | Reads or changes the tax settings; `PATCH` returns all of them. Placed orders keep their tax. |
| `GET`, `PATCH /api/admin/settings/loyalty` | any of `isEnabled`, `earnRate`, `redeemRate`, `expiresAfterInDays` | Reads or changes the loyalty settings. Points can be redeemed only while enabled with a `redeemRate`. Points earned while `expiresAfterInDays` is set expire that many days later; changing it does not move points already earned. |
| `GET`, `POST /api/admin/shipping-methods` | `{ name, price, metadata? }` | Lists (newest first) or creates shipping methods |
| `GET`, `PATCH`, `DELETE /api/admin/shipping-methods/:id` | | Shows, changes or deletes one. Placed orders keep their own copy of the method. |

### Memberships

Body schemas are in `packages/api-admin/shared/utils/memberships.ts`.

| Route | Body or query | Does |
|---|---|---|
| `GET`, `POST /api/admin/membership-plans` | `q`, `active`, `page`, `size` / `{ name, slug, program, rank, description?, isActive? }` | Lists plans (by program, highest rank first, each with `termCount`) or creates one. Slugs are unique (409 `AlreadyExists`). |
| `GET`, `PATCH`, `DELETE /api/admin/membership-plans/:id` | plan fields | Shows (with its terms, each with the variant and product), changes or deletes it. A plan with memberships cannot be deleted (409 `InUse`): deactivate it. |
| `POST /api/admin/membership-plans/:id/terms` | `{ variantId, months }` | Makes the variant sell the plan for 1 to 120 months. A variant sells one term (409 `AlreadyExists`); a missing variant gives 422. |
| `DELETE /api/admin/membership-terms/:id` | | The variant stops selling it (204); memberships already bought stay |
| `GET /api/admin/memberships` | `q` (part of the member's email or name), `userId`, `plan`, `state` (`active`, `upcoming`, `ended`, `cancelled`), `page`, `size` | Memberships, latest start first, each with its `plan`, `state`, `member` (name and email) and `grantedByEmail` |
| `POST /api/admin/memberships` | `{ userId, planId, months }` | Grants a plan, recorded as given by the signed-in admin. The same plan again extends it (starts when the current one ends); a higher tier replaces a lower one. 422 for an inactive plan, 404 for a missing user or plan. |
| `POST /api/admin/memberships/:id/cancel` | `{ reason }` | Ends a running or upcoming membership now; 422 if already cancelled |

### Orders and users

Body schemas are in `packages/api-admin/shared/utils/orders.ts`. Each change records the signed-in admin.

| Route | Body or query | Does |
|---|---|---|
| `GET /api/admin/orders` | `q` (order id, user id, or part of the customer's email or name, members' included), `status`, `tab` (`Active`, `Inactive`, `Cancelled`, `Completed`), `paymentStatus`, `userId`, `createdAt` (`YYYY-MM-DD`), `page`, `size` | Orders, newest first, each with `customer` (`name`, `email`, `guest`) and `items` (how many), without their lines |
| `GET /api/admin/orders/:id` | | The order with its lines, payments, `customer`, `logs` (what changed, when, by whom and their `loggedByEmail`), and `payment`: its `method` (`{ id, label, online }`) and `canRefund` (it can be refunded through the method) |
| `POST /api/admin/orders/:id/status` | `{ status }` | Moves it to another status. Not `Cancelled` (400): cancel it instead. A cancelled order cannot change (422). |
| `POST /api/admin/orders/:id/cancel` | `{ reason, remarks? }` | Cancels it, giving back its offer usage and redeemed loyalty points, and runs the cancelled fulfilment hooks |
| `POST /api/admin/orders/:id/payment-status` | `{ paymentStatus }` | Sets `Pending`, `Paid` or `Refunded` by hand, for example for cash on delivery or pay later. A change to `Paid` runs the paid fulfilment hooks, and a change to `Refunded` the refunded ones. |
| `POST /api/admin/orders/:id/refund` | | Refunds the whole payment through the order's payment method (such as back to the card), records it, marks the order Refunded, and runs the refunded fulfilment hooks. 422 unless `payment.canRefund`. |
| `GET /api/admin/users` | `q` (part of the email), `role` (`admin` or `user`) or `banned`, `page`, `size` | Customers and staff, newest first |
| `POST /api/admin/users` | `{ email, name? }` | Adds staff: the account with that email (in any case) becomes staff, or one is made with the staff role, named after the email unless `name` is given. Answers `{ user, created }`. |
| `GET /api/admin/users/:id` | | A person for their page: `user` (name, email, role, ban), `orders` (the 5 latest, each with its number of `items`, and the `total` count), `memberships` (with their `state`), `addresses` and `loyalty` (`points`, `value`) |
| `PATCH /api/admin/users/:id` | `{ role?, name? }` (at least one) | Makes a user staff (`admin`) or a customer (`user`), and changes their name. You cannot remove your own admin role (422). |
| `POST /api/admin/users/:id/ban` | `{ reason?, days? }` | Bans a user (forever without `days`) and signs them out everywhere. You cannot ban yourself (400). |
| `POST /api/admin/users/:id/unban` | | Lifts a ban |

The user routes go through Better Auth's admin plugin; its errors keep their status and message.

## Product images

Product images live in object storage and are shown from its public URL. The backoffice uploads them; the storefront only shows the stored URLs in an `img` tag and never sees the storage settings.

- **On the product page**, images are chosen as files (links cannot be pasted). A chosen file stays on the form as a local preview, marked Not uploaded yet, and is uploaded when the product is saved. The first image is the thumbnail until another is chosen. Discard drops the files not uploaded yet.
- **Saving** checks the form, then uploads each new file in order, then saves the product as before, with the images' public URLs (the product API stays JSON). The slug must be lowercase letters, numbers and hyphens for images to upload; otherwise it is highlighted and nothing uploads. If an upload fails, the product is not saved; the files already uploaded keep their URLs on the form, so trying again does not upload them twice.
- **`POST /api/admin/product-images`** (staff only, like every `/api/admin` route) takes a multipart `file` and `slug`. It accepts JPEG, PNG and WebP, judged by the file's bytes, not its name or declared type, up to 8 MiB (415 and 413 otherwise; 422 for a slug it cannot use). The key is `<slug>.<ext>`; when that key is taken, `<slug>-1.<ext>`, `<slug>-2.<ext>` and so on, so nothing is overwritten. A different type is a different key. Objects are stored with their content type, `Content-Disposition: inline` and a year-long immutable `Cache-Control`; no ACL is set, as the bucket's public URL is what makes them readable. A bucket failure gives 502 and an unconfigured storage 503, each with the reason.
- **Removing an image** takes it off the product only; the object stays in the bucket. Changing a slug does not rename stored objects; later uploads use the slug at the time.
- **Where they go** (`packages/api-admin/server/utils/objectStorage.ts`): a real R2 binding named `R2` when present (`globalThis.R2`, `globalThis.__env__.R2`, or `event.context.cloudflare.env.R2` on a Nitro Cloudflare deploy; only a value with `put` and `get` counts, never `process.env.R2`); otherwise an S3-compatible bucket through aws4fetch, set with `NUXT_S3_ACCESS_KEY`, `NUXT_S3_SECRET_KEY`, `NUXT_S3_BUCKET_NAME`, `NUXT_S3_ENDPOINT_URL` and `NUXT_S3_REGION` (for R2 from Node, the endpoint is `https://<account>.r2.cloudflarestorage.com`); otherwise uploads fail with "Object storage is not configured". `NUXT_S3_PUBLIC_URL` (the bucket's public address) is needed either way. These settings are the backoffice's only (`apps/backoffice/.env.example`).
- Image URLs saved before this keep showing. The rich text editors and variants have no image upload.

## Order emails

The customer gets an email when their order is placed (after checkout), shipped (when staff move it to Shipped; setting it again, any other status, or an order with nothing to ship sends nothing) and cancelled (with the reason, not the staff remarks). Nothing else is sent: no staff copies, nothing for other statuses or payment changes.

- It goes to the guest's email, or the member's account email; without one, nothing is sent.
- Each has the order number and a link to the order on the storefront with the checkout hash (`{NUXT_PUBLIC_SITE_URL}/orders/{id}?hash=…`), which opens without signing in. The placed email also lists the lines, with their fulfilment notes, and the total. They use the store's name, currency and locale.
- `sendOrderEmail(event, kind, order)` (api-core, `server/utils/orderEmails.ts`) sends them before the route answers; the content is in `server/order-emails.ts`. It never throws: a missing address or storefront URL, or a failed send, is logged, and the order, status change or cancellation stands.
- They go through the auth layer's `sendEmail()`, the same SES sender and development console fallback as the sign-in email. A failing SES is retried twice (aws4fetch's default is 10 retries, about 25 seconds), so a send that fails does not hold up the request for long; the image upload's storage client does the same. `NUXT_SES_ENDPOINT` points it at another SES v2 endpoint (the API tests use a local stand-in that records the mails).
- The backoffice sends the shipped and cancelled emails, so it needs `NUXT_PUBLIC_SITE_URL` (the storefront's address; without it they are not sent) and the storefront's `ORDER_HASH_SECRET`. The storefront links to its own address when `NUXT_PUBLIC_SITE_URL` is not set.

## Payments

Payment methods are **providers**, registered in code and switched on by listing their ids in `NUXT_PAYMENT_METHODS` (comma separated), in the order checkout shows them. None is on by default.

| Id | Kind | Offered | What happens |
|---|---|---|---|
| `cash_on_delivery` | offline, built in | When the cart has something to ship | The courier collects; staff mark the order paid |
| `pay_later` | offline, built in | When nothing is shipped (digital goods), and no online method is on (unless `NUXT_PAY_LATER_WITH_ONLINE=true`) | The store arranges payment; staff mark the order paid |
| `stripe` | online, `packages/payment-stripe` | Any cart, once its keys are set | The buyer pays by card on Stripe Checkout |
| `thuprai_pay` | online, `packages/payment-thuprai-pay` | Any cart, once its keys are set | The buyer pays on Thuprai Pay's page with eSewa, Khalti, Fonepay, ConnectIPS, NamastePay or a card |

A listed id that no provider has, or a provider without its keys, is skipped with a warning in the server log.

**An order and its payment.** The order is placed first, with payment Pending, and holds its stock, offer usage and redeemed points as any order does; the method is the order's `paymentMethod`. With an online method:

1. Checkout starts the payment and sends the buyer to the gateway. The order log says "Payment started with Card", and the order's `metadata.payment` keeps the latest try (`provider`, the gateway's `reference`, `status` `open` or `failed`, a failure `message`, `startedAt`).
2. The gateway sends the buyer back to `/api/store/payments/:provider/return` (or its cancel link), and calls `/api/store/payments/:provider/webhook`. Neither is trusted as it is: each time, the provider asks the gateway how the payment went.
3. A paid payment is recorded as a payment event under the gateway's payment id, once however often it is reported, and the order is marked Paid and runs the paid fulfilment hooks (memberships, downloads). One of another amount than the order's total, for a cancelled order, or for one already paid, is recorded but not marked: the order log says why, for staff.
4. A failed one (declined, cancelled, expired) marks the try failed. The buyer lands on the order page either way.

The storefront's order page then shows the result. Paid: done. Open (we have not heard back yet): "Confirming your payment…", checking a few times. Failed: "Your last payment did not go through", and **Pay now**, which is also there for any unpaid order with an online method. Pay now offers every method the order can use: another online one starts a new payment, and an offline one (such as cash on delivery) switches the order to it.

Unpaid orders are never cancelled on their own: staff cancel them, which gives the stock, offer usage and points back. In the backoffice, an unpaid order with an online method says **Awaiting payment** instead of Confirm order (offline methods are confirmed as before), and a paid one has **Refund through Card**, which refunds the whole payment through the gateway. Mark as paid and Mark as refunded stay for anything done outside it.

### Stripe

1. Add `@awecommerce/payment-stripe` to both apps' `extends` (the base apps have it), and `stripe` to `NUXT_PAYMENT_METHODS`.
2. Set `NUXT_STRIPE_SECRET_KEY` (`sk_test_…` while testing) in both apps, and `NUXT_STRIPE_WEBHOOK_SECRET` in the storefront. `NUXT_STRIPE_LABEL` renames the method (Card by default).
3. In Stripe, add a webhook endpoint at `https://<storefront>/api/store/payments/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired`; its signing secret is `NUXT_STRIPE_WEBHOOK_SECRET`. Locally: `stripe listen --forward-to localhost:3000/api/store/payments/stripe/webhook` prints one.

The buyer pays the order's total, in the store's currency, as one line ("Order 123"). It uses Stripe's SDK through `fetch`, so it runs on Node and on Cloudflare Workers. `pnpm test:payments` runs its tests against a stand-in for Stripe's API (`packages/payment-stripe/tests/fake-stripe.ts`); the storefront's and backoffice's payment tests use it too.

### Thuprai Pay

Thuprai Pay (pay.awecode.com) puts Nepali wallets and banks, and cards, on one hosted page; the money settles into the merchant's own gateway accounts.

1. Add `@awecommerce/payment-thuprai-pay` to both apps' `extends` (the base apps have it), and `thuprai_pay` to `NUXT_PAYMENT_METHODS`.
2. In the storefront, set `NUXT_THUPRAI_PAY_API_KEY` (`ps_…`) and `NUXT_THUPRAI_PAY_WEBHOOK_SECRET`, both from Awecode. For the sandbox, also `NUXT_THUPRAI_PAY_API_BASE=https://ps-stg.awecode.workers.dev`; without it, the live service is used.
3. Have Thuprai Pay send webhooks to `https://<storefront>/api/store/payments/thuprai_pay/webhook`.

Checkout shows it as Thuprai Pay, "Pay with a Nepali wallet or bank" (`NUXT_THUPRAI_PAY_LABEL` and `NUXT_THUPRAI_PAY_DESCRIPTION` change them). The total goes in the currency's minor unit (paisa for NPR), with the order's id as `orderId` and a reference of its own for each try, so Pay now can start another. A payment counts only when Thuprai Pay's verify call says `fulfilled`, on the buyer's return and on each signed webhook (`X-Webhook-Signature`, an HMAC-SHA256 of the body, checked with Web Crypto so it runs on Workers). Coming back through the failure link while the payment is still open cancels it there. Its API refunds cash sales only, so the backoffice has no Refund through button for it: refund in the wallet or bank, then Mark as refunded. Its tests run against a stand-in (`packages/payment-thuprai-pay/tests/fake-thuprai-pay.ts`).

### Adding a payment method

A provider is a Nitro plugin calling `registerPaymentProvider` (`packages/api-core/server/utils/payments.ts`, where the type is documented): an `id`, a `label`, `online`, and for an online one `start` (create the payment at the gateway: where to send the buyer and the gateway's reference), `check` (ask the gateway about that reference: `paid` with the amount and payment id, `failed`, or `open`), `webhook` (check the signature, and say which order and reference it is about) and optionally `refund`, `available` and `configured`. The core does the rest: checkout, Pay now, the return and webhook routes, recording the payment, the order log and the hooks.

Put it in a layer of its own, as `packages/payment-stripe` is (its `nuxt.config.ts` and one plugin), and add that layer to both apps' `extends`. The layer should not extend `@awecommerce/api-core` itself: the apps already have it, and a second path to it loads the auth layer twice (in development, Nitro fails with "already mounted at auth:"). In a copy of this repository, that keeps your code in files the base never touches, so pulling the base's changes (`git pull upstream main`) does not conflict with it:

```ts
// layers/payment-mygateway/server/plugins/mygateway.ts
export default defineNitroPlugin(() => {
  registerPaymentProvider({
    id: 'mygateway',
    label: 'My gateway',
    online: true,
    configured: () => Boolean(useRuntimeConfig().mygateway.secretKey),
    start: async ({ order, amount, currency, returnUrl, cancelUrl }) => {
      const payment = await createPaymentAtGateway({ orderId: order.id, amount, currency, returnUrl, cancelUrl })
      return { redirectUrl: payment.url, reference: payment.id }
    },
    check: async ({ reference }) => {
      const payment = await readPaymentFromGateway(reference)
      return payment.paid ? { status: 'paid', amount: payment.amount, reference: payment.transactionId } : payment.failed ? { status: 'failed', message: payment.reason } : { status: 'open' }
    },
    webhook: async (event) => {
      const body = await readRawBody(event, 'utf8')
      // Check the gateway's signature here, and throw a 400 when it is wrong
      const data = JSON.parse(body!)
      return { orderId: Number(data.orderId), reference: data.paymentId }
    },
  })
})
```

## Digital goods

A product class has `requiresShipping` (Ships to the buyer in the backoffice), on by default; products without a class are shipped too. Turn it off for digital goods (e-books, licences, gift cards, courses).

- **Cart and checkout:** a cart with nothing to ship takes no address and no shipping method. It pays online, or later (`pay_later`: the store contacts the buyer, and staff mark it paid) when no online method is on (see Payments). A mixed cart is shipped as before: an address, a method, and cash on delivery or an online method.
- **Orders:** each line records `requiresShipping` when the order is placed, so changing the class later does not change past orders. An order with nothing to ship goes Confirm order, then Complete in the backoffice, and never gets the shipped email.
- **Fulfilment hooks** (`packages/api-core/server/utils/fulfillment.ts`): `registerFulfillment({ name, productClasses?, products?, match?, on?, note? })` matches order lines by their product's class slug or product slug, or by `match(line)`. `on.placed` runs after checkout, `on.paid` when the order is paid (staff change the payment to Paid, or a gateway confirms it), `on.refunded` when it is refunded (by hand, or through the payment method), and `on.cancelled` when the order is cancelled, each with the order and its matching lines, before the route answers. A hook that throws is logged; the order and the other hooks are not affected. `note({ order, line })` returns `{ title, text, link?: { label, url } }` (or nothing), read whenever the order is shown, so it can follow the payment; the first matching hook's note is used. A line with nothing to ship and no note gets "Your purchase is confirmed" (not once the order is cancelled). Notes show on the storefront's order page and in the placed email.
- **Registering hooks:** from a Nitro plugin in a layer both apps extend, as the storefront places orders and shows the notes while the backoffice marks them paid and cancels them:

```ts
// server/plugins/fulfillment.ts
export default defineNitroPlugin(() => {
  registerFulfillment({
    name: 'e-books',
    productClasses: ['e-book'],
    on: { paid: async ({ order, lines }) => { /* email the download links */ } },
    note: ({ order }) =>
      order.paymentStatus === 'Paid'
        ? { title: 'Ready to download', text: 'Your e-book is ready.', link: { label: 'Download', url: 'https://…' } }
        : { title: 'Download after payment', text: 'The link appears here once you have paid.' },
  })
})
```

The API tests register theirs in `packages/api-core/tests/fulfillment-hooks`.

## Memberships

Plans, such as Platinum, are grouped by `program` (such as `music`): a person holds at most one plan per program, and any number of programs. See Memberships in the library README for the rules.

- **Selling one:** make a product in a class that is not shipped and does not track stock, and link each variant to a plan and a number of months (Memberships, then Plans, in the backoffice). Its price is the variant's. A plan turned off is no longer sold: its terms show as unavailable in the cart, and checkout refuses them.
- **Buying:** only a signed-in buyer can check out a cart with a membership; the storefront's checkout asks a guest to sign in. When the order is paid (online, or marked paid by staff), the built-in membership hook (`packages/api-core/server/plugins/membership.ts`) grants the plan for the term's months times the quantity, to the order's user. Cancelling the order, or marking it refunded, cancels what it granted.
- **Renewing:** the account overview and `/account/memberships` show each plan the member holds, waits for, or held until the last 90 days ("Active until …", "Starts …", "Ended on …"), with a Renew button per term on sale (the plan active, the variant active, its product listed). Renew adds the term to the cart and opens the cart drawer; checkout is as usual. A renewal starts when the current one ends, or at once for an ended one. Only the same plan is offered: no upgrades yet, and no reminder emails.
- **The order page** says "It starts once your payment is confirmed", then "Active until …" (or when it starts, for a renewal that waits for the current one to end).
- **Perks:** user offers and vouchers with `includedMembershipPlanIds` apply to the plan's active members, in the cart and at checkout. An expired or cancelled membership stops them on the next read.
- **Member prices:** product variants have `memberPrice` (`{ planId, planName, price, isYours }` or null): what one unit costs members, from the offers that name a plan. A signed-in member sees their own plan's price (`isYours`), others the lowest. The product page shows "Platinum members: $80" or "Your Platinum price: $80".

## API errors

Wrap route handlers in `defineServiceHandler` so service errors become HTTP errors:

- `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError`, `CustomizationsNoLongerValidError` and `OutOfStockError` give 409, with the error name as `data.code` and the error's fields (such as `cartLineId`) in `data`.
- `NotFoundError` gives 404 and `ValidationError` gives 422, with the error's message.
- Database rules give Postgres's own detail as the message: a duplicate (such as a slug or SKU) gives 409 with `data.code` `AlreadyExists`; deleting a record that others still point at gives 409 `InUse`; pointing at a record that does not exist (such as a `categoryId`) gives 422 `MissingReference`.
- Anything else gives 500.

Unknown `/api` paths give a JSON 404.

Other scripts at the repo root run the same command in `@awecommerce/service`.
