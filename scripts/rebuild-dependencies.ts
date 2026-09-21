import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { pnpmInvocation } from './pnpm-invocation.ts'

const ROOT = resolve(import.meta.dirname, '..')

/** Run one pnpm command using the package manager that launched this script. */
function runPnpm(args: readonly string[]): void {
  const invocation = pnpmInvocation(args)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`deps:refresh ${args[0] ?? 'pnpm'} exited with ${String(result.status ?? result.signal)}`)
  }
}

/** Reconcile the lockfile and rebuild every native dependency in the workspace. */
function main(): void {
  const { values } = parseArgs({
    options: { force: { type: 'boolean', default: false } },
    allowPositionals: false,
    args: process.argv.slice(2).at(0) === '--' ? process.argv.slice(3) : process.argv.slice(2),
  })
  const installArgs = ['install', '--frozen-lockfile']
  if (values.force) installArgs.push('--force')
  runPnpm(installArgs)
  runPnpm(['rebuild'])
}

if (import.meta.main) main()
