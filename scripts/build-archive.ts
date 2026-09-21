import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { pnpmInvocation } from './pnpm-invocation.ts'

const ROOT = resolve(import.meta.dirname, '..')
const COMMIT_PATTERN = /^[0-9a-f]{7,40}$/iu

/** Run a complete build for a source archive that has no Git metadata. */
function main(): void {
  const { values } = parseArgs({
    options: { commit: { type: 'string' } },
    allowPositionals: false,
    args: process.argv.slice(2).at(0) === '--' ? process.argv.slice(3) : process.argv.slice(2),
  })
  const commit = values.commit?.trim()
  if (commit === undefined || !COMMIT_PATTERN.test(commit)) {
    throw new Error('build:archive requires --commit with a 7-40 character hexadecimal source identifier')
  }

  const environment = { ...process.env, DSH_CLIENT_COMMIT_HASH: commit }
  const invocation = pnpmInvocation(['run', 'build'], environment)
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: ROOT,
    env: environment,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`build:archive exited with ${String(result.status ?? result.signal)}`)
  }
}

if (import.meta.main) main()
