/** Account-scoped Routine wakeups; delivery acknowledgement never completes a job. */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import type { ComputerBinding, ComputerJob } from './computer-schema.ts'
import { computerWake } from './computer-schema.ts'

/** Deployment-owned references keep webhook credentials out of browser records. */
export const computerRoutineConfig = z.object({
  account: z.string().trim().min(1),
  urlEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  keyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
}).strict()

/** Resolve configured secrets at startup, failing without exposing their contents.
 * @param configs - One Routine per independent provider account.
 * @param environment - Host secret environment.
 * @returns Private transport configuration keyed by normalized account identifier.
 */
export function resolveComputerRoutines(configs: z.infer<typeof computerRoutineConfig>[], environment: NodeJS.ProcessEnv) {
  const resolved = new Map<string, { url: string; key: string }>()
  for (const config of configs) {
    const account = config.account.toLowerCase()
    const url = environment[config.urlEnv]
    const key = environment[config.keyEnv]
    if (resolved.has(account)) throw new Error('Duplicate computer Routine account')
    if (!url || !URL.canParse(url) || !key?.trim() || /[\r\n]/.test(key)) throw new Error('Computer Routine credentials are missing or invalid')
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('Computer Routine requires an HTTPS webhook URL')
    resolved.set(account, { url, key })
  }
  return resolved
}

/** Select the oldest queued assignment only when the account has no unresolved work.
 * @param jobs - Persisted assignments in creation order.
 * @param computerId - Independent account binding to inspect.
 * @returns The next assignment, or undefined while work or acceptance is outstanding.
 */
export function nextComputerJob(jobs: ComputerJob[], computerId: string): ComputerJob | undefined {
  const assigned = jobs.filter(job => job.computerId === computerId)
  if (assigned.some(job => !['QUEUED', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(job.state))) return undefined
  return assigned.find(job => job.state === 'QUEUED')
}

/** Persist delivery before sending; never replay an ambiguous request after restart.
 * @param db - Enterprise database with the existing computer records table.
 * @param endpoints - Resolved account-specific webhook secrets.
 * @param timeoutMs - Maximum time to wait for acknowledgement.
 * @param send - HTTP transport; redirects are never followed.
 * @returns Delivery status and explicit wake operations, without credentials.
 */
export function computerRoutines(db: DatabaseSync, endpoints: ReturnType<typeof resolveComputerRoutines>, timeoutMs: number, send: typeof fetch = fetch) {
  const read = (id: string) => {
    const row = db.prepare('SELECT data FROM enterprise_computers WHERE id=? AND kind=?').get(`wake:${id}`, 'wake')
    return row ? computerWake.parse(JSON.parse(String(row.data))) : null
  }
  const save = (value: z.infer<typeof computerWake>) => {
    db.prepare('INSERT INTO enterprise_computers(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(`wake:${value.jobId}`, 'wake', JSON.stringify(value))
    return value
  }
  for (const row of db.prepare('SELECT data FROM enterprise_computers WHERE kind=?').all('wake')) {
    const value = computerWake.parse(JSON.parse(String(row.data)))
    if (value.state === 'sending') save({ ...value, state: 'unknown' })
  }
  return {
    configured: (binding: ComputerBinding) => endpoints.has(binding.account.toLowerCase()),
    list: () => db.prepare('SELECT data FROM enterprise_computers WHERE kind=?').all('wake').map(row => computerWake.parse(JSON.parse(String(row.data)))),
    async wake(binding: ComputerBinding, job: ComputerJob, signal: AbortSignal, retry = false) {
      const endpoint = endpoints.get(binding.account.toLowerCase())
      if (!binding.enabled || binding.id !== job.computerId || !endpoint) return null
      if (!['QUEUED', 'WAITING_HUMAN', 'WAITING_APPROVAL', 'CANCEL_REQUESTED'].includes(job.state)) return null
      const existing = read(job.id)
      const explicitRetry = retry && (existing?.state === 'rejected' || existing?.state === 'accepted' && job.state !== 'QUEUED')
      if (existing && (existing.state === 'sending' || existing.state === 'unknown' || existing.revision === job.revision && !explicitRetry)) return existing
      const attempt = save({ jobId: job.id, revision: job.revision, state: 'sending', status: null, at: new Date().toISOString() })
      try {
        const response = await send(endpoint.url, {
          method: 'POST', redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          headers: { authorization: `Bearer ${endpoint.key}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'check_work', jobId: job.id, revision: job.revision }),
        })
        // Response bodies may contain provider secrets; only the HTTP acknowledgement is retained.
        await response.body?.cancel()
        return save({ ...attempt, state: response.status === 200 ? 'accepted' : 'rejected', status: response.status })
      } catch {
        // A transport error cannot establish whether the provider started the Routine.
        return save({ ...attempt, state: 'unknown' })
      }
    },
  }
}
