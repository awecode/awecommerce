// Runs the test suite against a real Postgres, so the Postgres-only tests run
// instead of being skipped. Usage: `pnpm test:pg [vitest args]`
//
// If TEST_POSTGRES_URL is set, that database is used as is. Otherwise a
// throwaway server is started in a temp folder with initdb/pg_ctl (from PATH,
// or from PG_BIN, e.g. /usr/lib/postgresql/16/bin) and removed afterwards.
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import pg from 'pg'

const vitestArgs = process.argv.slice(2)
// Run Vitest by path with this Node, so it works without node_modules/.bin on PATH
const vitestBin = join(
  dirname(createRequire(import.meta.url).resolve('vitest/package.json')),
  'vitest.mjs',
)
let vitest

const runVitest = (url) =>
  new Promise((resolve) => {
    const child = (vitest = spawn(process.execPath, [vitestBin, 'run', ...vitestArgs], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test', TEST_POSTGRES_URL: url },
    }))
    child.on('error', (error) => {
      console.error(`Could not start vitest: ${error.message}`)
      resolve(1)
    })
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
  })

if (process.env.TEST_POSTGRES_URL) {
  process.exit(await runVitest(process.env.TEST_POSTGRES_URL))
}

const bin = (name) => (process.env.PG_BIN ? join(process.env.PG_BIN, name) : name)

const run = (name, args) => {
  const result = spawnSync(bin(name), args, { encoding: 'utf8' })
  if (result.error?.code === 'ENOENT') {
    throw new Error(
      `${name} not found. Install Postgres, set PG_BIN to its bin folder, ` +
        'or set TEST_POSTGRES_URL to an existing empty database.',
    )
  }
  if (result.status !== 0) {
    throw new Error(`${name} failed:\n${result.stderr || result.stdout}`)
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })

const dir = mkdtempSync(join(tmpdir(), 'awe-test-pg-'))
const dataDir = join(dir, 'data')
let started = false

const cleanup = () => {
  if (started) {
    spawnSync(bin('pg_ctl'), ['-D', dataDir, '-m', 'fast', 'stop'], { stdio: 'ignore' })
    started = false
  }
  rmSync(dir, { recursive: true, force: true })
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.on(signal, () => {
    vitest?.kill(signal)
    cleanup()
    process.exit(code)
  })
}

let exitCode = 1
try {
  const port = await freePort()
  run('initdb', ['-D', dataDir, '-U', 'postgres', '-A', 'trust'])
  run('pg_ctl', [
    '-D', dataDir,
    '-l', join(dir, 'postgres.log'),
    '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`,
    '-w',
    'start',
  ])
  started = true

  const admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' })
  await admin.connect()
  await admin.query('CREATE DATABASE awe_test')
  await admin.end()

  console.log(`Temporary Postgres running on port ${port}`)
  exitCode = await runVitest(`postgres://postgres@127.0.0.1:${port}/awe_test`)
} catch (error) {
  console.error(error.message)
} finally {
  cleanup()
}
process.exit(exitCode)
