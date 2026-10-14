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

## API errors

Wrap route handlers in `defineServiceHandler` so service errors become HTTP errors:

- `OrderTotalMismatchError`, `OfferLimitReachedError`, `VoucherNoLongerValidError` and `CustomizationsNoLongerValidError` give 409, with the error name as `data.code` and the error's fields (such as `cartLineId`) in `data`.
- Errors whose message says `not found: <id>` give 404.
- Anything else gives 500.

Unknown `/api` paths give a JSON 404.

The API has no authentication yet, so `/api/admin` is open. Don't deploy the backoffice until it does.

Other scripts at the repo root run the same command in `@awecommerce/service`.
