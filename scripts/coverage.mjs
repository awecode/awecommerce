// Runs coverage for each in-process suite and prints one table.
// Each package still writes its own HTML report under coverage/.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const packages = [
  ['@awecommerce/service', 'packages/service/coverage/coverage-summary.json'],
  ['@awecommerce/auth', 'packages/auth/coverage/coverage-summary.json'],
]

const run = (name) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      [
        '--filter',
        name,
        'exec',
        'vitest',
        'run',
        '--coverage',
        '--coverage.reporter=html',
        '--coverage.reporter=json-summary',
      ],
      { cwd: root, stdio: 'inherit' },
    )
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${name} coverage exited ${code ?? signal}`))
    })
  })

const percent = (value) => (typeof value === 'number' ? `${value.toFixed(1)}%` : 'n/a')

for (const [name] of packages) {
  await run(name)
}

const rows = []
for (const [name, summaryPath] of packages) {
  const summary = JSON.parse(await readFile(join(root, summaryPath), 'utf8'))
  const total = summary.total
  rows.push([
    name,
    percent(total.lines.pct),
    percent(total.statements.pct),
    percent(total.branches.pct),
    percent(total.functions.pct),
  ])
}

const headers = ['Package', 'Lines', 'Stmts', 'Branch', 'Funcs']
const widths = headers.map((header, index) =>
  Math.max(header.length, ...rows.map((row) => row[index].length)),
)
const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ')

console.log(`\n${line(headers)}`)
console.log(line(widths.map((width) => '-'.repeat(width))))
for (const row of rows) console.log(line(row))
console.log('\nHTML reports:')
for (const [, summaryPath] of packages) {
  console.log(`  ${dirname(summaryPath)}/index.html`)
}
