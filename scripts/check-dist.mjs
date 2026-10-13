// Loads every library module from the built package the way an installed app
// would: through the package's own name and `exports` map, with both `import`
// and `require`. Run after a build: `pnpm check:dist`.
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'
import process from 'node:process'

// core/db uses an in-memory PGlite database in test mode, so no server is needed
process.env.NODE_ENV = 'test'

const root = new URL('..', import.meta.url).pathname
const { name, exports } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)

// Not part of the library, or run side effects when loaded
const skip = [
  /(^|\/)tests\//,
  /\.test$/,
  /\.config$/,
  /^scripts\//,
  /^apps\/product\/seed$/,
  /^core\/db\/pg\/migrate(-pglite)?$/,
]

// Exports that must be present, to catch modules that load but export nothing
const expectedExports = {
  'apps/cart/services/cart': ['CartService'],
  'apps/loyalty/services/loyalty': ['LoyaltyService'],
  'apps/offer/services/offer': ['OfferService', 'OfferRangeService'],
  'apps/order/services/order': ['OrderService'],
  'apps/order/services/shipping-address': ['ShippingAddressService'],
  'apps/order/services/shipping-method': ['ShippingMethodService'],
  'apps/product/services/product': ['ProductService', 'CategoryService'],
  'apps/cart/schemas': ['carts', 'cartLines'],
  'apps/offer/schemas': ['offers'],
  'apps/order/schemas': ['orders'],
  'apps/product/schemas': ['products'],
  'apps/loyalty/schemas': ['loyaltyPoints'],
  'core/db': ['db'],
  'core/db/pg/schema': ['carts', 'orders', 'offers', 'products', 'loyaltyPoints'],
}

const listModules = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listModules(path)
    return entry.name.endsWith('.mjs') ? [path] : []
  })

// Every built module, plus the explicit `exports` paths (such as folder paths)
const subpaths = [
  ...listModules(join(root, 'dist'))
    .map((file) => relative(join(root, 'dist'), file).replace(/\.mjs$/, ''))
    .filter((subpath) => !skip.some((pattern) => pattern.test(subpath))),
  ...Object.keys(exports)
    .filter((key) => !key.includes('*'))
    .map((key) => key.slice(2)),
].sort()

const missingExports = (mod, subpath) =>
  (expectedExports[subpath] ?? []).filter((key) => mod[key] === undefined)

const failures = []
for (const subpath of subpaths) {
  const specifier = `${name}/${subpath}`
  for (const [format, load] of [
    ['import', (s) => import(s)],
    ['require', (s) => require(s)],
  ]) {
    try {
      const missing = missingExports(await load(specifier), subpath)
      if (missing.length) {
        failures.push(`${format} ${specifier}: missing exports ${missing.join(', ')}`)
      }
    } catch (error) {
      failures.push(`${format} ${specifier}: ${error.message.split('\n')[0]}`)
    }
  }
}

const checkedExports = Object.keys(expectedExports).filter((s) => subpaths.includes(s))
const notFound = Object.keys(expectedExports).filter((s) => !subpaths.includes(s))
for (const subpath of notFound) {
  failures.push(`${name}/${subpath}: expected module not found in dist`)
}

if (failures.length) {
  console.error(`dist check failed (${failures.length}):`)
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}
console.log(
  `dist check passed: ${subpaths.length} modules loaded with import and require, ` +
    `${checkedExports.length} checked for expected exports`,
)
process.exit(0)
