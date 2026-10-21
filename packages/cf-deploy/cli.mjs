#!/usr/bin/env node
// Interactive Cloudflare deploy for the storefront and backoffice.
// Uses the `cf` CLI (a beta), and the Cloudflare API with cf's login for stub Workers.
// Phase 1: Hyperdrive, with its id written into each app's wrangler.jsonc.
// Phase 2: stub Workers, the GitHub connection, Workers Builds triggers, vars
// and secrets, then a first build on Cloudflare.
//
// Progress is saved in .cf-deploy/state.json (gitignored, it holds secrets).
// Re-runs reuse what exists. New cloud resources are confirmed before they are created.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline/promises'
import { dirname, join, relative } from 'node:path'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { applyEdits, modify, parse, printParseErrorCode } from 'jsonc-parser'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const stateDir = join(root, '.cf-deploy')
const statePath = join(stateDir, 'state.json')

const require = createRequire(import.meta.url)
const cfBin = join(dirname(require.resolve('cf/package.json')), 'bin', 'cf')

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const flag = (name) => {
  const i = args.indexOf(name)
  if (i === -1) return undefined
  return args[i + 1]
}
const has = (name) => args.includes(name)

const usage = () => {
  console.log(`Usage: pnpm deploy:cf

Cloudflare deploy for this monorepo. Remembers progress in .cf-deploy/state.json
and reuses resources already created.

Options:
  --connection-string <url>  Postgres URL (also: DEPLOY_POSTGRES_URL)
  --name <name>              Hyperdrive name (default: awecommerce, or last saved)
  --reset                    Ignore saved Hyperdrive and create again
  --yes                      Take the default answer to every yes/no question
  --help                     Show this help

Phase 1: Hyperdrive (caching off), id written into apps/*/wrangler.jsonc.
Phase 2: GitHub connection, then each app in order (backoffice, then storefront):
  stub Worker, build trigger, shared settings, vars and secrets, Cloudflare build.

Asked once and saved: both site URLs, the store's name, currency and locale,
payment methods, ORDER_HASH_SECRET, the R2 bucket and its public URL, SES and
payment provider keys, Google Analytics and image resizing.
Custom domains go in wrangler.jsonc when a URL is not *.workers.dev.
Preview URLs stay off. R2 CORS allows both site origins.
`)
}

if (has('--help') || has('-h')) {
  usage()
  process.exit(0)
}

const notLoggedIn = (detail) => {
  const lines = ['Not logged in to Cloudflare.']
  if (detail) lines.push(detail)
  lines.push('Run: pnpm --filter @awecommerce/cf-deploy exec cf login')
  lines.push('Or set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) for CI.')
  throw new Error(lines.join('\n'))
}

let rl

const ask = async (label, fallback = '') => {
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout })
  const suffix = fallback ? ` [${fallback}]` : ''
  const answer = (await rl.question(`${label}${suffix}: `)).trim()
  return answer || fallback
}

// For values that may be empty: "-" clears a saved one.
const askOptional = async (label, saved = '') => {
  const answer = await ask(`${label} (- for none)`, saved)
  return answer === '-' ? '' : answer
}

// Secrets are not echoed back as the default. Empty keeps the saved one.
const askSecret = async (label, saved = '') => {
  const answer = await ask(label, saved ? '(keep saved)' : '')
  return answer === '(keep saved)' ? saved : answer
}

// --yes takes the default, so "Update ...?" questions (default no) stay skipped.
const confirm = async (label, { defaultYes = false } = {}) => {
  if (has('--yes') || has('-y')) return defaultYes
  if (!rl) rl = createInterface({ input: process.stdin, output: process.stdout })
  const hint = defaultYes ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${label} [${hint}]: `)).trim().toLowerCase()
  if (!answer) return defaultYes
  return answer === 'y' || answer === 'yes'
}

// Backoffice first (staff app), then storefront.
const APPS = [
  { key: 'backoffice', filter: '@awecommerce/backoffice', dir: 'apps/backoffice' },
  { key: 'storefront', filter: '@awecommerce/storefront', dir: 'apps/storefront' },
]

const BOTH = ['backoffice', 'storefront']

// Email for sign-in links and order emails, through Amazon SES. Both apps send mail.
const SES_SETTINGS = [
  { name: 'NUXT_SES_REGION', apps: BOTH, fallback: 'us-east-1' },
  { name: 'NUXT_SES_FROM_EMAIL', apps: BOTH, required: true, hint: 'a verified sender' },
  { name: 'NUXT_SES_ACCESS_KEY_ID', apps: BOTH, required: true },
  { name: 'NUXT_SES_SECRET_KEY', apps: BOTH, secret: true, required: true },
]

// Payment methods this CLI knows (ids for NUXT_PAYMENT_METHODS), and the settings
// each needs in which app. Secrets go to the Worker; the rest to wrangler.jsonc vars.
// To deploy another provider, add its id and settings here. An id not listed
// is still accepted, but its keys are then yours to set.
const PAYMENT_PROVIDERS = [
  { id: 'cash_on_delivery', settings: [] },
  { id: 'pay_later', settings: [] },
  {
    id: 'stripe',
    settings: [
      // Both apps: the storefront takes payments, the backoffice refunds them
      { name: 'NUXT_STRIPE_SECRET_KEY', apps: BOTH, secret: true, required: true },
      { name: 'NUXT_STRIPE_WEBHOOK_SECRET', apps: ['storefront'], secret: true, required: true },
      { name: 'NUXT_STRIPE_LABEL', apps: BOTH, hint: 'Card when empty' },
    ],
  },
  {
    id: 'thuprai_pay',
    settings: [
      { name: 'NUXT_THUPRAI_PAY_API_KEY', apps: ['storefront'], secret: true, required: true },
      { name: 'NUXT_THUPRAI_PAY_WEBHOOK_SECRET', apps: ['storefront'], secret: true, required: true },
      { name: 'NUXT_THUPRAI_PAY_API_BASE', apps: ['storefront'], hint: 'the live service when empty' },
      { name: 'NUXT_THUPRAI_PAY_LABEL', apps: BOTH, hint: 'Thuprai Pay when empty' },
      { name: 'NUXT_THUPRAI_PAY_DESCRIPTION', apps: ['storefront'], hint: 'the default text when empty' },
    ],
  },
]

const KNOWN_PAYMENT_IDS = PAYMENT_PROVIDERS.map((provider) => provider.id)

// Every var this CLI writes. One that an app should no longer have is removed
// from its wrangler.jsonc (such as BETTER_AUTH_URL on the storefront).
const MANAGED_VARS = [
  'NUXT_PUBLIC_STORE_NAME',
  'NUXT_PUBLIC_STORE_CURRENCY',
  'NUXT_PUBLIC_STORE_LOCALE',
  'NUXT_PUBLIC_SITE_URL',
  'NUXT_PUBLIC_GOOGLE_ANALYTICS_ID',
  'NUXT_HOME_CATEGORY_ROW_SIZE',
  'NUXT_S3_PUBLIC_URL',
  'NUXT_PAYMENT_METHODS',
  'NUXT_AUTH_ADMIN_EMAILS',
  'BETTER_AUTH_URL',
  ...[...SES_SETTINGS, ...PAYMENT_PROVIDERS.flatMap((provider) => provider.settings)]
    .filter((setting) => !setting.secret)
    .map((setting) => setting.name),
]

const redactedUrl = (url) => {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(invalid url)'
  }
}

const parsePostgresUrl = (raw) => {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('Not a valid URL. Expected postgres://user:password@host:port/database')
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Scheme must be postgres or postgresql (got ${parsed.protocol.replace(':', '')})`)
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  if (!parsed.hostname) throw new Error('Host is missing from the connection string')
  if (!database) throw new Error('Database name is missing from the connection string')
  if (!parsed.username) throw new Error('User is missing from the connection string')
  return {
    connectionString: raw,
    scheme: 'postgres',
    host: parsed.hostname,
    port: Number(parsed.port || 5432),
    database,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  }
}

const runCf = (cfArgs, { input } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cfBin, ...cfArgs], {
      cwd: root,
      env: process.env,
      stdio: input ? ['pipe', 'pipe', 'pipe'] : ['inherit', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
      process.stderr.write(chunk)
    })
    if (input) {
      child.stdin.write(input)
      child.stdin.end()
    }
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr })
      else {
        reject(
          new Error(
            `cf ${cfArgs.join(' ')} failed (${code ?? signal})\n${stderr || stdout}`.trim(),
          ),
        )
      }
    })
  })

const runCfQuiet = (cfArgs) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cfBin, ...cfArgs], {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr })
      else {
        reject(
          new Error(
            `cf ${cfArgs.join(' ')} failed (${code ?? signal})\n${stderr || stdout}`.trim(),
          ),
        )
      }
    })
  })

const runCapture = (command, cmdArgs, { cwd = root } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, cmdArgs, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} ${cmdArgs.join(' ')} failed (${code ?? signal})\n${stderr || stdout}`.trim()))
    })
  })

const parseJsonValue = (text) => {
  const objectStart = text.indexOf('{')
  const arrayStart = text.indexOf('[')
  const start =
    objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart)
  if (start === -1) return undefined
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  const end = text.lastIndexOf(close)
  if (end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

// Hyperdrive ids are 32 hex chars (no hyphens). Other Cloudflare ids may be UUIDs.
const extractId = (text) => {
  const parsed = parseJsonValue(text)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof parsed.id === 'string') {
    return parsed.id
  }
  const match = text.match(/"id"\s*:\s*"([0-9a-f-]{32,36})"/i)
  return match?.[1]
}

const loadState = async () => {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch {
    return {}
  }
}

const saveState = async (patch) => {
  await mkdir(stateDir, { recursive: true })
  const next = { ...(await loadState()), ...patch, updatedAt: new Date().toISOString() }
  await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

// wrangler.jsonc is edited in place, so its comments stay.
const wranglerPathFor = (app) => join(root, app.dir, 'wrangler.jsonc')

const readWrangler = async (path) => {
  const text = await readFile(path, 'utf8')
  const errors = []
  const data = parse(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const [first] = errors
    throw new Error(
      `Could not parse ${relative(root, path)}: ${printParseErrorCode(first.error)} at offset ${first.offset}`,
    )
  }
  return { text, data: data || {} }
}

// Each change is [keyPath, value]; undefined removes the key. Returns whether
// the file changed.
const editWrangler = async (path, changes) => {
  const { text: before } = await readWrangler(path)
  let text = before
  for (const [keyPath, value] of changes) {
    const edits = modify(text, keyPath, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
    })
    text = applyEdits(text, edits)
  }
  if (text === before) return false
  await writeFile(path, text)
  return true
}

// Clear "env already applied" flags so the next ensureWorkerEnv push cannot skip
// after shared vars or secrets changed only in local state. Also marks both apps
// so a re-push is required even when secret *names* already exist on the Worker
// (Cloudflare does not let us read values, so a stale secret looks the same).
const invalidateWorkerEnvApplied = async (reason) => {
  const state = await loadState()
  const hadFlags = Object.values(state.envSet || {}).some(Boolean)
  const hadDirty = Object.values(state.envNeedsPush || {}).some(Boolean)
  if (!hadFlags && !hadDirty) {
    // First-time setup: still mark both apps so a later skip cannot leave Cloudflare stale.
    return saveState({ envNeedsPush: { backoffice: true, storefront: true } })
  }
  console.log(`Shared config changed (${reason}). Will re-apply Worker vars and secrets.`)
  return saveState({
    envSet: {},
    envNeedsPush: { backoffice: true, storefront: true },
  })
}

const listWorkerSecretNames = async (worker) => {
  try {
    const { stdout } = await runCfQuiet(['workers', 'secrets', 'list', '--worker', worker.name])
    const body = JSON.parse(stdout)
    const listed = Array.isArray(body) ? body : body?.result || []
    return listed.map((entry) => entry.name).filter(Boolean)
  } catch {
    return []
  }
}

const paymentIds = (state) =>
  String(state.paymentMethods || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

// SES and the settings of each enabled payment provider.
const activeSettings = (state) => {
  const ids = paymentIds(state)
  return [
    ...SES_SETTINGS,
    ...PAYMENT_PROVIDERS.filter((provider) => ids.includes(provider.id)).flatMap(
      (provider) => provider.settings,
    ),
  ]
}

// Secrets for one app. BETTER_AUTH_SECRET is its own (pass the value, or a
// placeholder when only the names matter).
const secretsForApp = (appKey, state, betterAuthSecret) => {
  const secrets = {
    BETTER_AUTH_SECRET: betterAuthSecret,
    ORDER_HASH_SECRET: state.orderHashSecret,
  }
  for (const setting of activeSettings(state)) {
    const value = state.settings?.[setting.name]
    if (setting.secret && setting.apps.includes(appKey) && value) secrets[setting.name] = value
  }
  return secrets
}

const varsForApp = (appKey, state) => {
  const { backoffice, storefront } = state.sites
  const vars = {
    NUXT_PUBLIC_STORE_NAME: state.store.name,
    NUXT_PUBLIC_STORE_CURRENCY: state.store.currency,
    NUXT_PUBLIC_STORE_LOCALE: state.store.locale,
    NUXT_S3_PUBLIC_URL: state.r2PublicUrl,
  }
  if (appKey === 'backoffice') {
    // Auth URL = this Worker; SITE_URL = the storefront (order email links).
    vars.BETTER_AUTH_URL = backoffice
    vars.NUXT_PUBLIC_SITE_URL = storefront
    if (state.adminEmails) vars.NUXT_AUTH_ADMIN_EMAILS = state.adminEmails
  } else {
    // One public URL. Sign-in falls back to NUXT_PUBLIC_SITE_URL here.
    vars.NUXT_PUBLIC_SITE_URL = storefront
    vars.NUXT_PAYMENT_METHODS = state.paymentMethods || ''
    vars.NUXT_HOME_CATEGORY_ROW_SIZE = String(state.store.homeCategoryRowSize || 4)
    if (state.store.googleAnalyticsId) {
      vars.NUXT_PUBLIC_GOOGLE_ANALYTICS_ID = state.store.googleAnalyticsId
    }
  }
  for (const setting of activeSettings(state)) {
    const value = state.settings?.[setting.name]
    if (!setting.secret && setting.apps.includes(appKey) && value) vars[setting.name] = value
  }
  // An empty value is left out (and removed from wrangler.jsonc), so the app's default applies.
  return Object.fromEntries(Object.entries(vars).filter(([, value]) => value))
}

const writeHyperdriveIdToConfigs = async (id) => {
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    throw new Error(`Refusing to write an unexpected Hyperdrive id: ${id}`)
  }
  for (const app of APPS) {
    const path = wranglerPathFor(app)
    const changed = await editWrangler(path, [[['hyperdrive'], [{ binding: 'HYPERDRIVE', id }]]])
    console.log(`${changed ? 'Wrote' : 'Already set:'} Hyperdrive id in ${relative(root, path)}`)
  }
}

const ensureAuth = async () => {
  // cf auth whoami exits 0 even when logged out; parse the JSON instead.
  let stdout
  try {
    ;({ stdout } = await runCfQuiet(['auth', 'whoami']))
  } catch (error) {
    notLoggedIn(error.message)
  }

  let status
  try {
    status = JSON.parse(stdout)
  } catch {
    notLoggedIn('Could not parse `cf auth whoami` output.')
  }

  if (!status?.authenticated) {
    notLoggedIn(status?.error || undefined)
  }
}

const verifyDatabase = async (origin) => {
  console.log('\n== Verify database ==')
  console.log(`Connecting to ${redactedUrl(origin.connectionString)}`)
  const client = new pg.Client({
    connectionString: origin.connectionString,
    connectionTimeoutMillis: 15_000,
  })
  try {
    await client.connect()
    const { rows } = await client.query('select current_database() as db, current_user as user, version() as version')
    console.log(`OK: database=${rows[0].db} user=${rows[0].user}`)
    console.log(`Postgres: ${String(rows[0].version).split('\n')[0]}`)
  } finally {
    await client.end().catch(() => {})
  }
}

const getHyperdrive = async (id) => {
  try {
    const { stdout } = await runCfQuiet(['hyperdrive', 'get', id])
    const body = parseJsonValue(stdout)
    if (body?.id) return body
  } catch {
    return undefined
  }
  return undefined
}

const findHyperdriveByName = async (name) => {
  const listed = await runCfQuiet(['hyperdrive', 'list', '--per-page', '100'])
  const rows = parseJsonValue(listed.stdout)
  const list = Array.isArray(rows) ? rows : rows?.result || rows?.hyperdrives || []
  if (Array.isArray(list)) {
    const match = list.find((row) => row?.name === name)
    if (match?.id) return match
  }
  return undefined
}

const ensureCachingDisabled = async (hyperdrive) => {
  if (hyperdrive.caching?.disabled) return hyperdrive
  console.log(`Disabling query caching on Hyperdrive ${hyperdrive.id}...`)
  const updated = await runCf(['hyperdrive', 'update', hyperdrive.id, '--caching-disabled'])
  return parseJsonValue(updated.stdout) || parseJsonValue(updated.stderr) || hyperdrive
}

const rememberHyperdrive = async (hyperdrive, origin) => {
  const patch = {
    hyperdriveId: hyperdrive.id,
    hyperdriveName: hyperdrive.name,
    phase1Complete: true,
  }
  const from = origin || hyperdrive.origin
  if (from) {
    patch.originHost = from.host
    patch.originPort = from.port
    patch.originDatabase = from.database
    patch.originUser = from.user
  }
  await saveState(patch)
  await writeHyperdriveIdToConfigs(hyperdrive.id)
  return hyperdrive.id
}

const createHyperdrive = async (origin, name) => {
  console.log('\n== Create Hyperdrive ==')
  console.log(`Name: ${name}`)
  console.log('Caching: disabled (required for carts, stock, vouchers, memberships)')

  const body = {
    name,
    origin: {
      scheme: origin.scheme,
      host: origin.host,
      port: origin.port,
      database: origin.database,
      user: origin.user,
      password: origin.password,
    },
    caching: { disabled: true },
  }

  let created = { stdout: '', stderr: '' }
  let createdBody
  try {
    created = await runCf(['hyperdrive', 'create', '--body', JSON.stringify(body)])
    createdBody = parseJsonValue(created.stdout) || parseJsonValue(created.stderr)
  } catch (error) {
    console.warn('Create with caching body failed, falling back to flags + update...')
    console.warn(String(error.message).split('\n')[0])
    try {
      created = await runCf([
        'hyperdrive',
        'create',
        '--name',
        name,
        '--origin-scheme',
        origin.scheme,
        '--origin-host',
        origin.host,
        '--origin-port',
        String(origin.port),
        '--origin-database',
        origin.database,
        '--origin-user',
        origin.user,
        '--origin-password',
        origin.password,
      ])
      createdBody = parseJsonValue(created.stdout) || parseJsonValue(created.stderr)
    } catch (createError) {
      console.warn('Create failed; looking for an existing Hyperdrive with this name...')
      console.warn(String(createError.message).split('\n')[0])
      const existing = await findHyperdriveByName(name)
      if (!existing?.id) throw createError
      createdBody = existing
    }
  }

  const id =
    createdBody?.id ||
    extractId(created.stdout) ||
    extractId(created.stderr) ||
    (await findHyperdriveByName(name))?.id

  if (!id) {
    throw new Error('Hyperdrive was created but its id could not be parsed from cf output. Check `cf hyperdrive list`.')
  }

  let hyperdrive = createdBody?.id ? createdBody : await getHyperdrive(id)
  if (!hyperdrive) hyperdrive = { id, name, caching: {} }
  hyperdrive = await ensureCachingDisabled(hyperdrive)

  console.log(`\nHyperdrive ready: ${id}`)
  return hyperdrive
}

const resumeHyperdrive = async (state) => {
  if (has('--reset')) {
    console.log('Ignoring saved Hyperdrive (--reset).')
    return undefined
  }

  if (state.hyperdriveId) {
    console.log(`\n== Resume Hyperdrive ==`)
    console.log(`Saved id: ${state.hyperdriveId}${state.hyperdriveName ? ` (${state.hyperdriveName})` : ''}`)
    const current = await getHyperdrive(state.hyperdriveId)
    if (current) {
      const ready = await ensureCachingDisabled(current)
      await rememberHyperdrive(ready)
      console.log(`Reusing existing Hyperdrive: ${ready.id}`)
      return ready
    }
    console.log('Saved Hyperdrive no longer exists in this Cloudflare account.')
  }

  const name = flag('--name') || state.hyperdriveName
  if (name) {
    const byName = await findHyperdriveByName(name)
    if (byName) {
      console.log(`\n== Resume Hyperdrive ==`)
      console.log(`Found by name "${name}": ${byName.id}`)
      const ready = await ensureCachingDisabled(byName)
      await rememberHyperdrive(ready)
      console.log(`Reusing existing Hyperdrive: ${ready.id}`)
      return ready
    }
  }

  return undefined
}

const writeWorkerNameToConfig = async (app, name) => {
  if (!/^[a-z0-9]([a-z0-9_-]{0,61}[a-z0-9])?$/i.test(name)) {
    throw new Error(
      `Invalid Worker name "${name}". Use letters, numbers, hyphens, underscores (max 63 chars).`,
    )
  }
  const path = wranglerPathFor(app)
  // preview_urls is explicit: leaving it out does not change an existing setting.
  const changed = await editWrangler(path, [
    [['name'], name],
    [['preview_urls'], false],
  ])
  console.log(`${changed ? 'Wrote' : 'Already set:'} Worker name in ${relative(root, path)}`)
}

// The prefix for suggested names: the Hyperdrive's name, else the repo's.
const namePrefix = (state) =>
  state.hyperdriveName || state.githubRepo?.split('/')[1] || 'awecommerce'

const suggestedWorkerName = async (app, state) => {
  if (state.workers?.[app.key]?.name) return state.workers[app.key].name
  return `${namePrefix(state)}-${app.key}`
}

const getWorkerByName = async (name) => {
  try {
    const { stdout } = await runCfQuiet(['workers', 'get', name])
    return parseJsonValue(stdout)
  } catch {
    return undefined
  }
}

// A token for the API calls cf has no command for: CLOUDFLARE_API_TOKEN, or cf's login.
const getApiToken = () => {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN
  const path = join(process.env.HOME || '', '.config/cloudflare/config/default.json')
  try {
    const auth = JSON.parse(readFileSync(path, 'utf8'))
    if (!auth.oauth_token) throw new Error('missing oauth_token')
    return auth.oauth_token
  } catch {
    throw new Error(
      'Could not read the Cloudflare OAuth token. Run: pnpm --filter @awecommerce/cf-deploy exec cf login',
    )
  }
}

const getAccountId = async () => {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID
  const { stdout } = await runCfQuiet(['auth', 'whoami'])
  const who = JSON.parse(stdout)
  const id = who.accounts?.[0]?.id
  if (!id) throw new Error('No Cloudflare account on this login.')
  return id
}

const workersApi = async (path, init = {}) => {
  const accountId = await getAccountId()
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${getApiToken()}`, ...(init.headers || {}) },
  })
  return res.json()
}

// Placeholder Worker so Builds has a script to attach to. The real app comes from GitHub.
const createStubWorker = async (name) => {
  const code =
    'export default {\n' +
    '  async fetch() {\n' +
    "    return new Response('Deploy pending: Workers Builds will publish the app from GitHub.')\n" +
    '  },\n' +
    '}\n'
  const form = new FormData()
  form.append(
    'metadata',
    new Blob(
      [
        JSON.stringify({
          main_module: 'worker.mjs',
          compatibility_date: '2025-05-15',
          compatibility_flags: ['nodejs_compat'],
        }),
      ],
      { type: 'application/json' },
    ),
  )
  form.append('worker.mjs', new Blob([code], { type: 'application/javascript+module' }), 'worker.mjs')

  const json = await workersApi(`/workers/scripts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: form,
  })
  if (!json.success) {
    throw new Error(`Failed to create Worker "${name}": ${JSON.stringify(json.errors || json)}`)
  }

  // Preview (version) URLs off from the start; wrangler's preview_urls maps here.
  await setWorkerSubdomainPreviews(name, { previewsEnabled: false })
}

const setWorkerSubdomainPreviews = async (name, { previewsEnabled = false } = {}) => {
  const path = `/workers/scripts/${encodeURIComponent(name)}/subdomain`
  let enabled = true
  try {
    const body = await workersApi(path)
    if (body?.success && typeof body.result?.enabled === 'boolean') {
      enabled = body.result.enabled
    }
  } catch {
    // New Workers default to workers.dev enabled until a custom domain replaces it.
  }
  const json = await workersApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled, previews_enabled: previewsEnabled }),
  })
  if (!json.success) {
    console.warn(`Could not set Preview URLs on ${name}: ${JSON.stringify(json.errors || json)}`)
    return
  }
  console.log(`Preview URLs ${previewsEnabled ? 'enabled' : 'disabled'} for ${name}`)
}

const disableBuildsPreviews = async (worker) => {
  if (!worker?.tag) return
  try {
    await runCf(['builds', 'workers', 'update', worker.tag, '--previews-enabled', 'false'])
    console.log(`Builds Previews disabled for ${worker.name}`)
  } catch (error) {
    console.warn(`Could not disable Builds Previews for ${worker.name}: ${error.message}`)
  }
}

const ensureWorker = async (app, state) => {
  console.log(`\n== Worker: ${app.key} ==`)

  const saved = state.workers?.[app.key]
  if (saved?.name && saved?.tag) {
    let existing = await getWorkerByName(saved.name)
    if (!existing) {
      try {
        const { stdout } = await runCfQuiet(['workers', 'get', saved.tag])
        existing = parseJsonValue(stdout)
      } catch {
        // gone
      }
    }
    if (existing?.id) {
      const name = existing.name || saved.name
      await writeWorkerNameToConfig(app, name)
      await setWorkerSubdomainPreviews(name, { previewsEnabled: false })
      console.log(`Reusing existing Worker ${name} (tag ${existing.id})`)
      return { key: app.key, name, tag: existing.id, filter: app.filter, dir: app.dir }
    }
  }

  const suggested = await suggestedWorkerName(app, state)
  const name = await ask(`${app.key} Worker name`, suggested)
  await writeWorkerNameToConfig(app, name)

  let worker = await getWorkerByName(name)
  if (worker?.id) {
    console.log(`Reusing existing Worker ${worker.name || name} (tag ${worker.id})`)
    await setWorkerSubdomainPreviews(name, { previewsEnabled: false })
    await saveState({
      workers: {
        ...(state.workers || {}),
        [app.key]: { name: worker.name || name, tag: worker.id },
      },
    })
    return { key: app.key, name: worker.name || name, tag: worker.id, filter: app.filter, dir: app.dir }
  }

  const ok = await confirm(
    `Create Worker "${name}" as a placeholder, then build the real app on Cloudflare from GitHub?`,
    { defaultYes: true },
  )
  if (!ok) {
    throw new Error(`Worker "${name}" is required. Re-run and confirm create, or create it in the dashboard.`)
  }

  console.log(`Creating placeholder Worker "${name}" via Cloudflare API...`)
  await createStubWorker(name)

  worker = await getWorkerByName(name)
  if (!worker?.id) {
    throw new Error(`Worker "${name}" was not found after create.`)
  }

  console.log(`Created Worker ${worker.name || name} (tag ${worker.id})`)
  const next = await loadState()
  await saveState({
    workers: {
      ...(next.workers || {}),
      [app.key]: { name: worker.name || name, tag: worker.id },
    },
  })
  return { key: app.key, name: worker.name || name, tag: worker.id, filter: app.filter, dir: app.dir }
}

const parseGithubRemote = (url) => {
  const trimmed = url.trim().replace(/\.git$/, '')
  const ssh = trimmed.match(/git@github\.com:(.+)$/)
  if (ssh) {
    const [owner, repo] = ssh[1].split('/')
    return { owner, repo }
  }
  const https = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)$/)
  if (https) return { owner: https[1], repo: https[2] }
  throw new Error(`Could not parse GitHub remote: ${url}`)
}

// The repo behind `origin`, with the numeric ids Workers Builds wants (through gh).
const detectGithubRepo = async () => {
  const { stdout: remote } = await runCapture('git', ['remote', 'get-url', 'origin'])
  const { owner, repo } = parseGithubRemote(remote)
  const { stdout } = await runCapture('gh', [
    'api',
    `repos/${owner}/${repo}`,
    '--jq',
    '{id,name,owner:.owner.login,owner_id:.owner.id,default_branch}',
  ])
  const info = JSON.parse(stdout)
  return {
    owner: info.owner,
    ownerId: String(info.owner_id),
    repo: info.name,
    repoId: String(info.id),
    defaultBranch: info.default_branch || 'main',
  }
}

const ensureGithubConnection = async (state, github) => {
  console.log('\n== GitHub repository ==')
  console.log(`Repo: ${github.owner}/${github.repo} (branch ${github.defaultBranch})`)

  if (state.repoConnectionUuid && state.githubRepo === `${github.owner}/${github.repo}`) {
    console.log(`Reusing repo connection ${state.repoConnectionUuid}`)
    return state.repoConnectionUuid
  }

  const ok = await confirm(
    `Connect ${github.owner}/${github.repo} to Cloudflare Builds? (the Cloudflare GitHub App must already be installed for it)`,
    { defaultYes: true },
  )
  if (!ok) throw new Error('GitHub connection is required for Workers Builds.')

  const created = await runCf([
    'builds',
    'repos',
    'connections',
    'upsert',
    '--provider-type',
    'github',
    '--provider-account-id',
    github.ownerId,
    '--provider-account-name',
    github.owner,
    '--repo-id',
    github.repoId,
    '--repo-name',
    github.repo,
  ])
  const body = parseJsonValue(created.stdout) || parseJsonValue(created.stderr)
  const uuid =
    body?.repo_connection_uuid ||
    body?.uuid ||
    body?.id ||
    extractId(created.stdout) ||
    extractId(created.stderr)

  if (!uuid) {
    throw new Error(
      'Repo connection upsert succeeded but no uuid was returned. Check Cloudflare dashboard > Workers > Builds.',
    )
  }

  await saveState({
    repoConnectionUuid: uuid,
    githubRepo: `${github.owner}/${github.repo}`,
    githubDefaultBranch: github.defaultBranch,
  })
  console.log(`Repo connection: ${uuid}`)
  return uuid
}

const ensureBuildToken = async (state) => {
  console.log('\n== Build token ==')
  if (state.buildTokenUuid) {
    console.log(`Reusing saved build token ${state.buildTokenUuid}`)
    return state.buildTokenUuid
  }

  const { stdout } = await runCfQuiet(['builds', 'tokens', 'list'])
  const tokens = parseJsonValue(stdout)
  const list = Array.isArray(tokens) ? tokens : []
  if (list.length === 0) {
    throw new Error(
      'No Workers Builds tokens on this account. Create one in the dashboard (Worker > Settings > Builds > API token), then re-run.',
    )
  }

  console.log('Existing build tokens:')
  for (const [index, token] of list.entries()) {
    console.log(`  ${index + 1}. ${token.build_token_name} (${token.build_token_uuid})`)
  }

  const pick = (await ask('Use token number (or paste uuid)', '1')).trim()
  let uuid = pick
  const asIndex = Number(pick)
  if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= list.length) {
    uuid = list[asIndex - 1].build_token_uuid
  }
  if (!list.some((token) => token.build_token_uuid === uuid)) {
    throw new Error(`Unknown build token: ${pick}`)
  }

  await saveState({ buildTokenUuid: uuid })
  console.log(`Using build token ${uuid}`)
  return uuid
}

const listTriggers = async (tag) => {
  try {
    const { stdout } = await runCfQuiet(['builds', 'triggers', 'list', '--external-script-id', tag])
    const value = parseJsonValue(stdout)
    return Array.isArray(value) ? value : value?.result || []
  } catch {
    return []
  }
}

const appBuildCommand = (worker) =>
  `pnpm install --frozen-lockfile && pnpm --filter ${worker.filter} run build:cf`

// On Workers Builds (WORKERS_CI is set), Nitro writes .output/server/wrangler.json:
// the app's wrangler.jsonc plus the built entry and assets. Deploy that, from the
// app's directory. Nitro's output is already bundled for Workers.
const appDeployCommand = (worker) =>
  `pnpm --filter ${worker.filter} exec wrangler deploy --config .output/server/wrangler.json`

const ensureProductionTrigger = async (worker, { repoConnectionUuid, buildTokenUuid, defaultBranch }) => {
  console.log(`\n== Build trigger: ${worker.name} ==`)
  const buildCommand = appBuildCommand(worker)
  const deployCommand = appDeployCommand(worker)
  console.log(`Build: ${buildCommand}`)
  console.log(`Deploy: ${deployCommand}`)
  console.log(`Root: /  Branch: ${defaultBranch}`)

  const existing = await listTriggers(worker.tag)
  const production = existing.find(
    (trigger) =>
      trigger.trigger_name?.toLowerCase().includes('production') ||
      (Array.isArray(trigger.branch_includes) && trigger.branch_includes.includes(defaultBranch)),
  )

  if (production?.trigger_uuid) {
    const sameCommands =
      production.build_command === buildCommand && production.deploy_command === deployCommand
    if (sameCommands) {
      console.log(`Reusing trigger ${production.trigger_uuid} (${production.trigger_name || 'production'})`)
      return production.trigger_uuid
    }
    console.log(`Updating trigger ${production.trigger_uuid} with new build and deploy commands...`)
    await runCf([
      'builds',
      'triggers',
      'update',
      production.trigger_uuid,
      '--body',
      JSON.stringify({
        build_command: buildCommand,
        deploy_command: deployCommand,
        root_directory: '/',
      }),
    ])
    console.log(`Trigger updated: ${production.trigger_uuid}`)
    return production.trigger_uuid
  }

  const ok = await confirm(`Create production build trigger for ${worker.name}?`, { defaultYes: true })
  if (!ok) throw new Error(`Build trigger for ${worker.name} is required.`)

  const created = await runCf([
    'builds',
    'triggers',
    'create',
    '--body',
    JSON.stringify({
      external_script_id: worker.tag,
      repo_connection_uuid: repoConnectionUuid,
      build_token_uuid: buildTokenUuid,
      trigger_name: `Deploy ${worker.name} production`,
      build_command: buildCommand,
      deploy_command: deployCommand,
      root_directory: '/',
      branch_includes: [defaultBranch],
      branch_excludes: [],
      path_includes: ['*'],
      path_excludes: [],
      build_caching_enabled: true,
    }),
  ])
  const body = parseJsonValue(created.stdout) || parseJsonValue(created.stderr)
  const uuid =
    body?.trigger_uuid || body?.uuid || body?.id || extractId(created.stdout) || extractId(created.stderr)
  if (!uuid) {
    throw new Error(`Trigger created for ${worker.name} but uuid was not returned.`)
  }
  console.log(`Trigger: ${uuid}`)
  return uuid
}

// Build-time variables (not Worker vars). IMAGE_PROVIDER=cloudflare turns on
// Cloudflare image resizing in @nuxt/image, which is decided when the app is built.
const ensureBuildEnv = async (worker, triggerUuid, state) => {
  if (state.store?.imageResizing) {
    await runCf([
      'builds',
      'triggers',
      'environment-variables',
      'upsert',
      triggerUuid,
      '--body',
      JSON.stringify({ IMAGE_PROVIDER: { value: 'cloudflare', is_secret: false } }),
    ])
    console.log(`Build variable IMAGE_PROVIDER=cloudflare set for ${worker.name}`)
    return
  }
  try {
    await runCfQuiet([
      'builds',
      'triggers',
      'environment-variables',
      'delete',
      'IMAGE_PROVIDER',
      '--trigger-uuid',
      triggerUuid,
      '--force',
    ])
    console.log(`Build variable IMAGE_PROVIDER removed for ${worker.name}`)
  } catch {
    // Not set: images are shown as stored.
  }
}

const accountWorkersSubdomain = async () => {
  try {
    const body = await workersApi('/workers/subdomain')
    return body?.success ? body.result?.subdomain || '' : ''
  } catch {
    return ''
  }
}

const workersDevUrl = async (workerName) => {
  const subdomain = await accountWorkersSubdomain()
  return subdomain
    ? `https://${workerName}.${subdomain}.workers.dev`
    : `https://${workerName}.workers.dev`
}

const randomSecret = () => randomBytes(32).toString('base64')

const normalizeSiteUrl = (input) => {
  let value = String(input || '').trim().replace(/\/$/, '')
  if (!value) return ''
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  try {
    const url = new URL(value)
    if (!url.hostname) throw new Error('missing host')
    return `${url.protocol}//${url.host}`
  } catch {
    throw new Error(`Not a valid site URL: ${input}`)
  }
}

const hostnameFromSiteUrl = (siteUrl) => new URL(siteUrl).hostname

const isWorkersDevHost = (hostname) => hostname.endsWith('.workers.dev')

// Writes this app's vars, the R2 binding and its custom domain into wrangler.jsonc.
const patchWranglerDeployConfig = async (worker, { vars, siteUrl, r2BucketName }) => {
  const path = wranglerPathFor(worker)
  const { data } = await readWrangler(path)
  const changes = Object.entries(vars).map(([key, value]) => [['vars', key], value])
  for (const key of MANAGED_VARS) {
    if (!(key in vars) && data.vars && key in data.vars) {
      changes.push([['vars', key], undefined])
      console.log(`Removing var ${key} from ${relative(root, path)}`)
    }
  }
  // Always opt out of version and preview URLs (omitting it leaves an existing setting alone).
  changes.push([['preview_urls'], false])
  if (r2BucketName) {
    changes.push([['r2_buckets'], [{ binding: 'R2', bucket_name: r2BucketName }]])
    console.log(`R2 binding R2 = ${r2BucketName} in ${relative(root, path)}`)
  }
  const hostname = hostnameFromSiteUrl(siteUrl)
  if (!isWorkersDevHost(hostname)) {
    changes.push([['routes'], [{ pattern: hostname, custom_domain: true }]])
    console.log(`Custom domain for ${worker.name}: ${hostname}`)
  } else if (Array.isArray(data.routes)) {
    // Drop stale custom domains when falling back to workers.dev.
    changes.push([['routes'], undefined])
  }
  await editWrangler(path, changes)
  console.log(`Wrote vars to ${relative(root, path)}: ${Object.keys(vars).join(', ')}`)
}

// A name cannot be both a var and a secret on one Worker.
const deleteWorkerSecretsIfPresent = async (worker, names) => {
  const have = new Set(await listWorkerSecretNames(worker))
  if (!have.size) return
  for (const name of names) {
    if (!have.has(name)) continue
    try {
      await runCf(['workers', 'secrets', 'delete', name, '--worker', worker.name, '--force'])
      console.log(`Removed secret ${name} from ${worker.name} (now a plain var).`)
    } catch (error) {
      console.warn(`Could not delete secret ${name} on ${worker.name}: ${error.message}`)
    }
  }
}

const parsePaymentMethods = (raw) => {
  const ids = String(raw || '')
    .split(/[,\s]+/)
    .map((id) => id.trim())
    .filter(Boolean)
  const unknown = ids.filter((id) => !KNOWN_PAYMENT_IDS.includes(id))
  if (unknown.length) {
    console.warn(
      `No settings known for ${unknown.join(', ')}: kept in NUXT_PAYMENT_METHODS, set their keys yourself ` +
        '(or add them to PAYMENT_PROVIDERS in packages/cf-deploy/cli.mjs).',
    )
  }
  return [...new Set(ids)].join(',')
}

const listR2Buckets = async () => {
  const names = []
  let startAfter = ''
  // The default page is about 20; walk with start-after until a short page.
  for (let page = 0; page < 100; page++) {
    try {
      const listArgs = ['r2', 'buckets', 'list', '--per-page', '100']
      if (startAfter) listArgs.push('--start-after', startAfter)
      const { stdout } = await runCfQuiet(listArgs)
      const body = parseJsonValue(stdout)
      const buckets = body?.buckets || (Array.isArray(body) ? body : body?.result || [])
      const pageNames = buckets.map((row) => row?.name).filter(Boolean)
      if (!pageNames.length) break
      for (const name of pageNames) {
        if (!names.includes(name)) names.push(name)
      }
      const last = pageNames[pageNames.length - 1]
      if (last === startAfter || pageNames.length < 100) break
      startAfter = last
    } catch {
      break
    }
  }
  return names.sort((a, b) => a.localeCompare(b))
}

const r2BucketExists = async (name) => {
  try {
    const { stdout } = await runCfQuiet(['r2', 'buckets', 'get', name])
    const body = parseJsonValue(stdout)
    return Boolean(body?.name || body?.result?.name)
  } catch {
    return false
  }
}

const findZoneIdForHostname = async (hostname) => {
  const host = hostname.toLowerCase()
  const candidates = []
  const labels = host.split('.').filter(Boolean)
  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join('.'))
  }

  // Prefer an exact zone name lookup (accounts can have hundreds of zones).
  for (const name of candidates) {
    try {
      const { stdout } = await runCfQuiet(['zones', 'list', '--name', name, '--per-page', '5'])
      const body = parseJsonValue(stdout)
      const zones = Array.isArray(body) ? body : body?.result || []
      const exact = zones.find((zone) => zone?.name === name)
      if (exact?.id) return exact.id
    } catch {
      // try next candidate
    }
  }

  try {
    const { stdout } = await runCfQuiet(['zones', 'list', '--per-page', '50'])
    const body = parseJsonValue(stdout)
    const zones = Array.isArray(body) ? body : body?.result || []
    const matches = zones
      .filter((zone) => host === zone.name || host.endsWith(`.${zone.name}`))
      .sort((a, b) => b.name.length - a.name.length)
    return matches[0]?.id || ''
  } catch {
    return ''
  }
}

const managedR2DevUrl = async (bucketName) => {
  try {
    const { stdout } = await runCfQuiet([
      'r2',
      'buckets',
      'domains',
      'managed',
      'list',
      '--bucket-name',
      bucketName,
    ])
    const body = parseJsonValue(stdout)
    const domain = body?.domain || body?.result?.domain
    if (domain) return domain.startsWith('http') ? domain : `https://${domain}`
  } catch {
    // ignore
  }
  return ''
}

// One R2 bucket for both Workers (binding R2): backoffice uploads and storefront
// profile photos. Its public URL is NUXT_S3_PUBLIC_URL (a custom domain or r2.dev).
// CORS allows both site origins.
const ensureR2 = async (state) => {
  console.log('\n== R2 (object storage) ==')
  if (state.r2BucketName && state.r2PublicUrl) {
    console.log(`Bucket: ${state.r2BucketName}`)
    console.log(`Public: ${state.r2PublicUrl}`)
    const again = await confirm('Update R2 bucket, public URL or CORS?', { defaultYes: false })
    if (!again) return state
  }

  const names = await listR2Buckets()
  if (names.length) {
    console.log(`Existing buckets (${names.length}):`)
    names.forEach((name, i) => console.log(`  ${i + 1}. ${name}`))
  }

  let bucketName = ''
  for (;;) {
    const pick = (
      await ask(
        'R2 bucket (number, existing name, or new name to create)',
        state.r2BucketName || bucketName || `${namePrefix(state)}-media`,
      )
    ).trim()
    if (!pick) {
      console.log('An R2 bucket is required.')
      continue
    }

    const asIndex = Number(pick)
    if (Number.isInteger(asIndex) && asIndex >= 1 && asIndex <= names.length) {
      bucketName = names[asIndex - 1]
    } else {
      bucketName = pick
    }

    const exists = names.includes(bucketName) || (await r2BucketExists(bucketName))
    if (exists) {
      console.log(`Using R2 bucket ${bucketName}`)
      break
    }

    const ok = await confirm(`No bucket named "${bucketName}". Create it?`, { defaultYes: true })
    if (!ok) {
      console.log('Enter a number from the list, or an existing bucket name.')
      continue
    }
    await runCf(['r2', 'buckets', 'create', '--name', bucketName])
    console.log(`Created R2 bucket ${bucketName}`)
    break
  }

  const storeHost = state.sites?.storefront ? hostnameFromSiteUrl(state.sites.storefront) : 'example.com'
  const parent = storeHost.split('.').length > 2 ? storeHost.split('.').slice(-2).join('.') : storeHost
  const suggestedCdn = isWorkersDevHost(storeHost) ? '' : `cdn.${parent}`

  const domainInput = (
    await ask('R2 public hostname (custom domain, empty to use r2.dev)', state.r2CustomDomain || suggestedCdn)
  ).trim()

  let publicUrl = ''
  let customDomain = ''
  if (domainInput) {
    customDomain = domainInput.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    let zoneId = await findZoneIdForHostname(customDomain)
    if (!zoneId) {
      const domainLabels = customDomain.split('.').filter(Boolean)
      const apexHint = domainLabels.length >= 2 ? domainLabels.slice(-2).join('.') : customDomain
      console.log(
        `Could not find the zone. In the dashboard: ${apexHint} > Overview > Zone ID. Or: cf zones list --name ${apexHint}`,
      )
      zoneId = (await ask(`Cloudflare zone id for ${customDomain}`, '')).trim()
    }
    if (!zoneId) {
      throw new Error(`Could not resolve a zone for ${customDomain}. Pass the zone id.`)
    }
    try {
      await runCf([
        'r2',
        'buckets',
        'domains',
        'custom',
        'create',
        bucketName,
        '--domain',
        customDomain,
        '--zone-id',
        zoneId,
        '--enabled',
        'true',
      ])
      console.log(`Attached custom domain ${customDomain} to ${bucketName}`)
    } catch (error) {
      console.warn(`Custom domain attach (may already exist): ${error.message}`)
    }
    publicUrl = `https://${customDomain}`
  } else {
    await runCf(['r2', 'buckets', 'domains', 'managed', 'update', bucketName, '--enabled', 'true', '--force'])
    publicUrl = (await managedR2DevUrl(bucketName)) || ''
    if (!publicUrl) {
      publicUrl = normalizeSiteUrl(await ask('r2.dev public URL (from the dashboard if empty)', ''))
    }
    console.log(`Enabled r2.dev for ${bucketName}: ${publicUrl}`)
  }

  publicUrl = normalizeSiteUrl(publicUrl)

  const origins = [state.sites?.backoffice, state.sites?.storefront]
    .filter(Boolean)
    .map((url) => normalizeSiteUrl(url))
  if (origins.length) {
    const rules = [
      {
        allowed: { origins, methods: ['GET', 'HEAD', 'PUT', 'POST'], headers: ['*'] },
        exposeHeaders: ['ETag'],
        maxAgeSeconds: 86400,
      },
    ]
    await runCf(['r2', 'buckets', 'cors', 'update', bucketName, '--rules', JSON.stringify(rules), '--force'])
    console.log(`CORS on ${bucketName} for: ${origins.join(', ')}`)
  }

  await saveState({
    r2BucketName: bucketName,
    r2PublicUrl: publicUrl,
    r2CustomDomain: customDomain || null,
  })
  return invalidateWorkerEnvApplied('R2 bucket or public URL')
}

// The store's identity, the same in both apps, and the storefront's optional extras.
const ensureStoreSettings = async (state) => {
  console.log('\n== Store ==')
  if (state.store?.name) {
    console.log(`Name: ${state.store.name}  Currency: ${state.store.currency}  Locale: ${state.store.locale}`)
    console.log(`Google Analytics: ${state.store.googleAnalyticsId || '(none)'}`)
    console.log(`Home category row size: ${state.store.homeCategoryRowSize}`)
    console.log(`Image resizing: ${state.store.imageResizing ? 'on' : 'off'}`)
    const again = await confirm('Update store settings?', { defaultYes: false })
    if (!again) return state
  }
  const saved = state.store || {}

  let name = ''
  while (!name) name = await ask('Store name (NUXT_PUBLIC_STORE_NAME)', saved.name || '')

  let currency = ''
  while (!/^[A-Z]{3}$/.test(currency)) {
    currency = (await ask('Currency, ISO 4217 (NUXT_PUBLIC_STORE_CURRENCY)', saved.currency || 'USD')).toUpperCase()
  }

  let locale = ''
  while (!locale) {
    const answer = await ask('Locale, BCP 47 (NUXT_PUBLIC_STORE_LOCALE)', saved.locale || 'en-US')
    try {
      locale = Intl.getCanonicalLocales(answer)[0]
    } catch {
      console.log(`Not a locale: ${answer}`)
    }
  }

  const googleAnalyticsId = await askOptional(
    'Storefront Google Analytics 4 id, such as G-XXXXXXXXXX (NUXT_PUBLIC_GOOGLE_ANALYTICS_ID)',
    saved.googleAnalyticsId || '',
  )

  let homeCategoryRowSize = 0
  while (!(homeCategoryRowSize > 0)) {
    homeCategoryRowSize = Number(
      await ask('Products in each home page category row (NUXT_HOME_CATEGORY_ROW_SIZE)', String(saved.homeCategoryRowSize || 4)),
    )
    if (!Number.isInteger(homeCategoryRowSize)) homeCategoryRowSize = 0
  }

  console.log(
    'Image resizing uses Cloudflare image transformations on the sites\' zone. Turn them on for the zone,\n' +
      'and allow the R2 public host as a source. It is set at build time (IMAGE_PROVIDER=cloudflare).',
  )
  const imageResizing = await confirm('Resize images with Cloudflare?', {
    defaultYes: Boolean(saved.imageResizing),
  })

  await saveState({
    store: { name, currency, locale, googleAnalyticsId, homeCategoryRowSize, imageResizing },
  })
  return invalidateWorkerEnvApplied('store settings')
}

const askSettings = async (settings, values) => {
  for (const setting of settings) {
    const label = setting.hint ? `${setting.name} (${setting.hint})` : setting.name
    const saved = values[setting.name] || setting.fallback || ''
    let value = ''
    for (;;) {
      if (setting.secret) value = await askSecret(label, saved)
      else if (setting.required) value = await ask(label, saved)
      else value = await askOptional(label, saved)
      if (value || !setting.required) break
      console.log(`${setting.name} is required.`)
    }
    values[setting.name] = value
  }
  return values
}

// SES and the keys of each enabled payment provider, asked once.
const ensureProviderSettings = async (state) => {
  console.log('\n== SES and payment provider keys ==')
  const settings = activeSettings(state)
  const missing = settings.filter((setting) => setting.required && !state.settings?.[setting.name])
  if (!missing.length && state.settings) {
    console.log('SES and payment keys already saved in state.')
    const again = await confirm('Update SES or payment provider keys?', { defaultYes: false })
    if (!again) return state
  }
  const values = await askSettings(settings, { ...(state.settings || {}) })
  await saveState({ settings: values })
  return invalidateWorkerEnvApplied('SES or payment keys')
}

// Ask once: both public sites, admin emails, payment methods, ORDER_HASH_SECRET,
// then the store, R2 and provider keys. Saved in .cf-deploy/state.json (gitignored)
// so the storefront reuses the same answers.
const ensureSharedRuntime = async (backofficeWorker) => {
  let state = await loadState()
  const have =
    state.sites?.backoffice &&
    state.sites?.storefront &&
    typeof state.paymentMethods === 'string' &&
    state.orderHashSecret

  let again = true
  if (have) {
    console.log('\n== Shared sites (from .cf-deploy/state.json) ==')
    console.log(`Backoffice:  ${state.sites.backoffice}`)
    console.log(`Storefront:  ${state.sites.storefront}`)
    console.log(`Payments:    ${state.paymentMethods || '(none)'}`)
    again = await confirm('Update shared sites, payments or ORDER_HASH_SECRET?', { defaultYes: false })
  }

  if (again) {
    console.log('\n== Shared sites ==')
    console.log('Asked once, then reused for both Workers (auth URLs, emails, custom domains).')

    const boSuggest = await workersDevUrl(backofficeWorker.name)
    const backofficeUrl = normalizeSiteUrl(
      await ask('Backoffice public URL (or hostname)', state.sites?.backoffice || boSuggest),
    )
    const sfSuggest =
      state.sites?.storefront ||
      (state.workers?.storefront?.name ? await workersDevUrl(state.workers.storefront.name) : '') ||
      'https://shop.example.com'
    const storefrontUrl = normalizeSiteUrl(await ask('Storefront public URL (or hostname)', sfSuggest))

    const adminEmails = (
      await askOptional('Staff admin emails, comma separated (NUXT_AUTH_ADMIN_EMAILS)', state.adminEmails || '')
    ).trim()

    console.log(`Payment methods with known settings: ${KNOWN_PAYMENT_IDS.join(', ')}`)
    const paymentMethods = parsePaymentMethods(
      await ask(
        'Payment methods to enable, in checkout order (comma separated)',
        state.paymentMethods || 'cash_on_delivery,pay_later',
      ),
    )

    const orderHash =
      (await askSecret(
        'ORDER_HASH_SECRET (shared by both apps, empty for a new random one)',
        state.orderHashSecret || '',
      )) || randomSecret()

    await saveState({
      sites: { backoffice: backofficeUrl, storefront: storefrontUrl },
      adminEmails,
      paymentMethods,
      orderHashSecret: orderHash,
    })
    state = await invalidateWorkerEnvApplied('shared sites, payments or ORDER_HASH_SECRET')
  }

  state = await ensureStoreSettings(state)
  state = await ensureR2(state)
  return ensureProviderSettings(state)
}

const betterAuthSecretFor = async (worker, state) => {
  // Per-app session secret (not shared). Reuse the saved value on resume.
  const saved = state.appSecrets?.[worker.key]?.BETTER_AUTH_SECRET
  const value = await askSecret(`BETTER_AUTH_SECRET for ${worker.key} (this app only, empty for a new random one)`, saved || '')
  return value || randomSecret()
}

const ensureWorkerEnv = async (worker) => {
  console.log(`\n== Runtime env: ${worker.name} ==`)
  let state = await loadState()

  if (worker.key === 'backoffice') {
    state = await ensureSharedRuntime(worker)
  } else if (!state.sites?.storefront || !state.orderHashSecret) {
    throw new Error('Shared sites are missing. Finish the backoffice first (re-run pnpm deploy:cf).')
  } else {
    console.log(`Using storefront URL ${state.sites.storefront} and shared settings from state.`)
    if (!state.store?.name) state = await ensureStoreSettings(state)
    if (!state.r2BucketName) state = await ensureR2(state)
    if (!state.settings?.NUXT_SES_SECRET_KEY) state = await ensureProviderSettings(state)
  }

  // Reload after shared prompts may have cleared envSet.
  state = await loadState()

  const onWorker = new Set(await listWorkerSecretNames(worker))
  const expected = Object.keys(secretsForApp(worker.key, state, 'placeholder'))
  const missing = expected.filter((name) => !onWorker.has(name))
  const needsPush = Boolean(state.envNeedsPush?.[worker.key]) || missing.length > 0
  if (missing.length) {
    console.log(`${worker.name} is missing secret(s) that are in state: ${missing.join(', ')}. Re-applying.`)
  } else if (state.envNeedsPush?.[worker.key]) {
    console.log(`${worker.name} needs a vars and secrets push (shared config changed since last apply).`)
  }

  if (state.envSet?.[worker.key] && !needsPush) {
    const again = await confirm(`Env for ${worker.name} was applied before. Update?`, { defaultYes: false })
    if (!again) {
      console.log('Keeping existing vars and secrets.')
      return
    }
  }

  const ok = await confirm(`Apply vars and secrets for ${worker.name} now?`, { defaultYes: true })
  if (!ok) {
    if (needsPush) {
      throw new Error(
        `Cannot skip: ${worker.name} still needs vars and secrets applied` +
          (missing.length ? ` (missing: ${missing.join(', ')})` : '') +
          '.',
      )
    }
    console.log('Skipped.')
    return
  }

  const vars = varsForApp(worker.key, state)
  await patchWranglerDeployConfig(worker, {
    vars,
    siteUrl: state.sites[worker.key],
    r2BucketName: state.r2BucketName,
  })
  await deleteWorkerSecretsIfPresent(worker, Object.keys(vars))

  const secrets = secretsForApp(worker.key, state, await betterAuthSecretFor(worker, state))
  await runCf([
    'workers',
    'secrets',
    'bulk',
    '--worker',
    worker.name,
    '--secrets',
    JSON.stringify(
      Object.fromEntries(
        Object.entries(secrets).map(([name, value]) => [name, { type: 'secret_text', value }]),
      ),
    ),
  ])
  console.log(`Secrets updated on ${worker.name}: ${Object.keys(secrets).join(', ')}`)

  const next = await loadState()
  await saveState({
    envSet: { ...(next.envSet || {}), [worker.key]: true },
    envNeedsPush: { ...(next.envNeedsPush || {}), [worker.key]: false },
    appSecrets: {
      ...(next.appSecrets || {}),
      [worker.key]: { BETTER_AUTH_SECRET: secrets.BETTER_AUTH_SECRET },
    },
  })
}

// Vars land in the local wrangler.jsonc files; Workers Builds deploys from git.
const remindCommitAndPush = () => {
  console.log(`
************************************************************************
  COMMIT AND PUSH before (or right after) relying on a Cloudflare build.

  Plain vars, the Worker names, Hyperdrive id, R2 bucket and custom
  domains are in apps/*/wrangler.jsonc, local only. They reach
  production when git has them and Workers Builds deploys.

  Secrets (SES, BETTER_AUTH_SECRET, ORDER_HASH_SECRET, payment keys)
  are already live. Keep .cf-deploy/state.json local (gitignored; it
  has secrets).
************************************************************************
`)
}

const deployOneApp = async (app, { repoConnectionUuid, buildTokenUuid, defaultBranch }) => {
  console.log(`\n======== ${app.key} ========`)
  let state = await loadState()

  if (state.envNeedsPush?.[app.key] && state.appsComplete?.[app.key]) {
    console.log(`${app.key} is complete, but shared settings changed since. Running it again.`)
  } else if (state.appsComplete?.[app.key]) {
    console.log(`${app.key} already marked complete in .cf-deploy/state.json.`)
    const redo = await confirm(`Run ${app.key} setup again?`, { defaultYes: false })
    if (!redo) {
      const saved = state.workers?.[app.key]
      if (saved?.name && saved?.tag) {
        return { key: app.key, name: saved.name, tag: saved.tag, filter: app.filter, dir: app.dir }
      }
    }
  }

  const worker = await ensureWorker(app, await loadState())
  const triggerUuid = await ensureProductionTrigger(worker, {
    repoConnectionUuid,
    buildTokenUuid,
    defaultBranch,
  })
  await disableBuildsPreviews(worker)

  state = await loadState()
  await saveState({
    productionTriggers: { ...(state.productionTriggers || {}), [worker.key]: triggerUuid },
  })

  await ensureWorkerEnv(worker)
  await ensureBuildEnv(worker, triggerUuid, await loadState())

  console.log(`\n== Cloudflare build: ${worker.name} ==`)
  console.log('Builds use the remote git branch. Commit and push wrangler.jsonc changes first if vars changed.')
  const startBuild = await confirm(`Start production build for ${worker.name} on Cloudflare CI?`, {
    defaultYes: true,
  })
  if (startBuild) {
    await runCf(['builds', 'create', triggerUuid, '--branch', defaultBranch])
    console.log(`Build started for ${worker.name}.`)
  } else {
    console.log(`Skipped. Later: cf builds create ${triggerUuid} --branch ${defaultBranch}`)
  }

  state = await loadState()
  await saveState({ appsComplete: { ...(state.appsComplete || {}), [app.key]: true } })
  console.log(`\n${app.key} deployment setup complete.`)
  return worker
}

const phase2WorkersAndGithub = async () => {
  console.log('\nPhase 2: Workers + GitHub Builds')
  console.log('Order: backoffice fully, then storefront.')

  const github = await detectGithubRepo()
  let state = await loadState()
  const repoConnectionUuid = await ensureGithubConnection(state, github)
  state = await loadState()
  const buildTokenUuid = await ensureBuildToken(state)

  const shared = { repoConnectionUuid, buildTokenUuid, defaultBranch: github.defaultBranch }

  for (const app of APPS) {
    await deployOneApp(app, shared)
    if (app.key === 'backoffice') {
      const cont = await confirm('Backoffice is done. Continue with storefront?', { defaultYes: true })
      if (!cont) {
        console.log('Stopped after backoffice. Re-run pnpm deploy:cf for storefront later.')
        await saveState({ phase2Complete: false })
        remindCommitAndPush()
        return
      }
    }
  }

  await saveState({ phase2Complete: true })
  console.log('\nPhase 2 complete for backoffice and storefront.')
  console.log('Optional next: turn off workers.dev for a Worker served on its custom domain.')
  remindCommitAndPush()
}

const main = async () => {
  await ensureAuth()

  console.log('Awecommerce Cloudflare deploy')
  console.log('Phase 1: database + Hyperdrive')
  console.log('Phase 2: Workers + GitHub Builds')

  const state = await loadState()
  const resumed = await resumeHyperdrive(state)
  if (!resumed) {
    const connectionString =
      flag('--connection-string') ||
      flag('-c') ||
      process.env.DEPLOY_POSTGRES_URL ||
      (await ask('Postgres connection string (postgres://user:password@host:port/database)'))

    if (!connectionString) {
      throw new Error('A connection string is required')
    }

    const origin = parsePostgresUrl(connectionString)
    await verifyDatabase(origin)

    const name = flag('--name') || state.hyperdriveName || 'awecommerce'
    console.log(`\nHyperdrive name: ${name}`)

    const hyperdrive = await createHyperdrive(origin, name)
    await rememberHyperdrive(hyperdrive, origin)
    console.log('\nSaved .cf-deploy/state.json and apps/*/wrangler.jsonc (no password stored).')
  }

  console.log('\nPhase 1 complete.')
  await phase2WorkersAndGithub()
}

try {
  await main()
} catch (error) {
  console.error(`\n${error.message || error}`)
  process.exitCode = 1
} finally {
  rl?.close()
}
