/** SQLite owns computer identity, disclosure, execution state and acceptance. */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { computerBinding, computerJob, computerId, computerCommand, computerJobInput, computerReport } from './computer-schema.ts'
import type { ComputerJob } from './computer-schema.ts'
import { taskId, taskSchema } from './tasks-schema.ts'

/** Expected rejection safe to return without storage or credential details. */
export class ComputerError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code) }
}

/** Create commands over the migrated enterprise database.
 * @param db - Host-owned database; all transitions commit synchronously.
 * @param fileExists - Check an enterprise file still exists on disk.
 * @returns Scoped worker operations and human management commands.
 */
export function computerStore(db: DatabaseSync, fileExists: (id: string) => boolean) {
  const terminal = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'])
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  const records = (kind: string) => db.prepare('SELECT data FROM enterprise_computers WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(String(row.data)) as unknown)
  const read = (id: string, kind: string): unknown => {
    const row = db.prepare('SELECT data FROM enterprise_computers WHERE id=? AND kind=?').get(id, kind)
    if (!row) throw new ComputerError(404, 'missing')
    return JSON.parse(String(row.data)) as unknown
  }
  const binding = (id: string) => computerBinding.parse(read(id, 'binding'))
  const job = (id: string) => computerJob.parse(read(id, 'job'))
  const jobs = () => records('job').map(value => computerJob.parse(value))
  const put = (id: string, kind: string, value: unknown) => { db.prepare('INSERT INTO enterprise_computers(id,kind,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id, kind, JSON.stringify(value)) }
  const transaction = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE')
    try { const value = fn(); db.exec('COMMIT'); return value }
    catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const audit = (actor: string, action: string, id: string, revision: number | null, detail: string) => {
    db.prepare('INSERT INTO enterprise_audit(actor,action,target,revision,created_at,detail) VALUES(?,?,?,?,?,?)').run(actor, `computer_${action}`, id, revision, new Date().toISOString(), detail)
  }
  const saveJob = (value: ComputerJob, actor: string, action: string) => {
    value.revision++; value.updatedAt = new Date().toISOString()
    put(value.id, 'job', computerJob.parse(value)); audit(actor, action, value.id, value.revision, value.progress)
    return value
  }
  const newTask = (id: string, title: string, description: string, assignee: string) => {
    const now = new Date().toISOString()
    const value = taskSchema.parse({ id, title, description, assignee, dueDate: null, status: 'todo', goalId: null, outcome: '', archived: false, revision: 1, createdAt: now, updatedAt: now })
    db.prepare('INSERT INTO enterprise_tasks(id,data) VALUES(?,?)').run(id, JSON.stringify(value))
    db.prepare('INSERT INTO enterprise_task_history(task_id,revision,data) VALUES(?,?,?)').run(id, 1, JSON.stringify({ action: 'create', actor: 'shared_host', task: value }))
  }
  const requireRevision = (value: ComputerJob, revision: number) => { if (value.revision !== revision) throw new ComputerError(409, 'conflict') }
  const requireActive = (value: ComputerJob) => { if (terminal.has(value.state) || ['VERIFYING', 'CANCEL_REQUESTED', 'UNKNOWN', 'QUEUED'].includes(value.state)) throw new ComputerError(409, 'state') }
  const workerJob = (id: string, workerId: string) => {
    const value = job(id)
    if (value.computerId !== workerId) throw new ComputerError(404, 'missing')
    if (!binding(workerId).enabled) throw new ComputerError(401, 'unauthorized')
    return value
  }
  const ready = (value: ComputerJob) => value.expectedOutputs.every((_, index) => value.artifacts.some(artifact => artifact.output === index && fileExists(artifact.fileId)))
  const create = (input: z.infer<typeof computerJobInput>) => {
    const previous = db.prepare('SELECT data FROM enterprise_computers WHERE id=?').get(input.id)
    if (previous) {
      const existing = job(input.id)
      if (JSON.stringify(computerJobInput.strip().parse(existing)) !== JSON.stringify(input)) throw new ComputerError(409, 'conflict')
      return existing
    }
    const computer = binding(input.computerId)
    if (!computer.enabled) throw new ComputerError(409, 'disconnected')
    if (input.inputFileIds.some(id => !fileExists(id))) throw new ComputerError(404, 'missingFile')
    const now = new Date().toISOString()
    const value = computerJob.parse({ ...input, taskId: randomUUID(), state: 'QUEUED', revision: 1, instructions: computer.instructions, contextVersion: hash(JSON.stringify(input)), createdAt: now, updatedAt: now, lastProgressAt: null, progress: '', result: '', artifacts: [], approvalTaskId: null, approvalAction: '' })
    newTask(value.taskId, value.objective, value.context, computer.worker)
    put(value.id, 'job', value); audit('shared_host', 'create', value.id, 1, value.objective)
    return value
  }
  return {
    bindings: () => records('binding').map(value => computerBinding.parse(value)), jobs, job,
    authenticate(token: string): string {
      const row = db.prepare('SELECT id FROM enterprise_computers WHERE kind=? AND token_hash=?').get('binding', hash(token))
      if (!row || !binding(String(row.id)).enabled) throw new ComputerError(401, 'unauthorized')
      return String(row.id)
    },
    workerJob,
    command(input: z.infer<typeof computerCommand>) {
      if (input.action === 'wake') throw new ComputerError(400, 'transportRequired')
      return transaction(() => {
        if (input.action === 'bind') {
          if (records('binding').some(record => computerBinding.parse(record).account.toLocaleLowerCase() === input.fields.account.toLocaleLowerCase())) throw new ComputerError(409, 'duplicateAccount')
          const value = computerBinding.parse({ ...input.fields, id: computerId.parse(randomUUID()), provider: 'grokbot', enabled: true, createdAt: new Date().toISOString() })
          put(value.id, 'binding', value)
          const token = randomBytes(32).toString('base64url')
          db.prepare('UPDATE enterprise_computers SET token_hash=? WHERE id=?').run(hash(token), value.id)
          audit('shared_host', 'bind', value.id, null, value.name)
          return { binding: value, token }
        }
        if (input.action === 'rotate' || input.action === 'disconnect') {
          const value = binding(input.id)
          const token = input.action === 'rotate' ? randomBytes(32).toString('base64url') : null
          value.enabled = token !== null
          put(value.id, 'binding', value)
          db.prepare('UPDATE enterprise_computers SET token_hash=? WHERE id=?').run(token ? hash(token) : null, value.id)
          if (!token) for (const current of jobs().filter(item => item.computerId === value.id && !terminal.has(item.state))) {
            current.state = current.state === 'QUEUED' ? 'CANCELLED' : 'UNKNOWN'
            saveJob(current, 'shared_host', 'disconnect')
          }
          audit('shared_host', input.action, value.id, null, value.name)
          return { binding: value, token }
        }
        if (input.action === 'create') return { job: create(input.job) }
        const value = job(input.id)
        requireRevision(value, input.expectedRevision)
        if (terminal.has(value.state)) throw new ComputerError(409, 'state')
        if (input.action === 'review') {
          if (value.state !== 'VERIFYING' || !input.verdict) throw new ComputerError(409, 'state')
          if (input.verdict === 'SUCCEEDED' && !ready(value)) throw new ComputerError(409, 'missingOutput')
          value.state = input.verdict
        } else if (input.action === 'cancel') value.state = value.state === 'QUEUED' ? 'CANCELLED' : 'CANCEL_REQUESTED'
        else value.state = 'UNKNOWN'
        value.progress = input.comment
        if (value.state === 'SUCCEEDED') {
          const row = db.prepare('SELECT data FROM enterprise_tasks WHERE id=?').get(value.taskId)
          const task = taskSchema.parse(JSON.parse(String(row?.data)))
          task.status = 'done'; task.outcome = value.result; task.revision++; task.updatedAt = new Date().toISOString()
          db.prepare('UPDATE enterprise_tasks SET data=? WHERE id=?').run(JSON.stringify(task), task.id)
          db.prepare('INSERT INTO enterprise_task_history(task_id,revision,data) VALUES(?,?,?)').run(task.id, task.revision, JSON.stringify({ action: 'update', actor: 'shared_host', task }))
        }
        return { job: saveJob(value, 'shared_host', input.action) }
      })
    },
    claim(workerId: string) {
      return transaction(() => {
        if (!binding(workerId).enabled) throw new ComputerError(401, 'unauthorized')
        const assigned = jobs().filter(value => value.computerId === workerId)
        // Lost claim responses return the existing assignment; execution never expires into a retry.
        const active = assigned.find(value => !terminal.has(value.state) && value.state !== 'QUEUED')
        if (active) return { job: active, resumed: true }
        const value = assigned.find(item => item.state === 'QUEUED')
        if (!value) return { job: null, resumed: false }
        value.state = 'RUNNING'; value.lastProgressAt = new Date().toISOString()
        return { job: saveJob(value, workerId, 'claim'), resumed: false }
      })
    },
    report(workerId: string, input: z.infer<typeof computerReport>) {
      return transaction(() => {
        const value = workerJob(input.id, workerId)
        requireRevision(value, input.expectedRevision)
        if (input.action === 'confirm_stop') {
          if (value.state !== 'CANCEL_REQUESTED') throw new ComputerError(409, 'state')
          value.state = 'CANCELLED'
        } else {
          requireActive(value)
          if (value.state === 'WAITING_APPROVAL') {
            const row = db.prepare('SELECT data FROM enterprise_approvals WHERE id=?').get(value.approvalTaskId!)
            const approval = row ? JSON.parse(String(row.data)) as { status: string; revision: number } : null
            const taskRow = db.prepare('SELECT data FROM enterprise_tasks WHERE id=?').get(value.approvalTaskId!)
            const task = taskRow ? taskSchema.parse(JSON.parse(String(taskRow.data))) : null
            if (input.action !== 'fail' && (approval?.status !== 'approved' || !task || task.archived || task.revision !== approval.revision)) throw new ComputerError(409, 'approvalRequired')
          }
          if (input.action === 'request_approval') {
            const id = taskId.parse(randomUUID())
            newTask(id, value.objective, input.message, binding(workerId).worker)
            db.prepare('INSERT INTO enterprise_approvals(id,data) VALUES(?,?)').run(id, JSON.stringify({ kind: 'task', id, revision: 1, status: 'submitted', comment: input.message, updatedAt: new Date().toISOString() }))
            value.approvalTaskId = id; value.approvalAction = input.message; value.state = 'WAITING_APPROVAL'
          } else if (input.action === 'submit_result') {
            if (!ready(value)) throw new ComputerError(409, 'missingOutput')
            value.result = input.message; value.state = 'VERIFYING'
          } else value.state = input.action === 'fail' ? 'FAILED' : input.waitingHuman ? 'WAITING_HUMAN' : 'RUNNING'
        }
        value.progress = input.message; value.lastProgressAt = new Date().toISOString()
        return saveJob(value, workerId, input.action)
      })
    },
    attach(workerId: string, id: string, revision: number, artifact: ComputerJob['artifacts'][number]) {
      return transaction(() => {
        const value = workerJob(id, workerId); requireRevision(value, revision); requireActive(value)
        if (value.state === 'WAITING_APPROVAL') throw new ComputerError(409, 'approvalRequired')
        if (!value.expectedOutputs[artifact.output] || !fileExists(artifact.fileId)) throw new ComputerError(400, 'missingOutput')
        value.artifacts = [...value.artifacts.filter(item => item.output !== artifact.output), artifact]
        return saveJob(value, workerId, 'artifact')
      })
    },
  }
}
