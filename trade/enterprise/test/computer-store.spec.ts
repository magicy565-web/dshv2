/** External work never expires into an automatic replay or accepts unverified results. */
import { afterEach, expect, test } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { computerStore } from '../src/computer-store.ts'
import { computerCommand, computerReport, computerFields } from '../src/computer-schema.ts'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })

test('binding URLs reject malformed text, embedded credentials and executable schemes without throwing', () => {
  for (const nativeUrl of ['', 'invalid', 'javascript:alert(1)', 'https://user:secret@example.com', 'https://example.com/?token=secret', 'https://example.com/#secret']) {
    expect(computerFields.safeParse({ name: 'Research', account: 'Account', worker: 'Worker', instructions: 'Research only', nativeUrl }).success).toBe(false)
  }
})
function fixture() {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  db.exec('CREATE TABLE enterprise_computers(id TEXT PRIMARY KEY,kind TEXT,data TEXT,token_hash TEXT UNIQUE); CREATE TABLE enterprise_tasks(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE enterprise_task_history(task_id TEXT,revision INTEGER,data TEXT); CREATE TABLE enterprise_approvals(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE enterprise_audit(id INTEGER PRIMARY KEY,actor TEXT,action TEXT,target TEXT,revision INTEGER,created_at TEXT,detail TEXT)')
  const files = new Set<string>()
  const store = computerStore(db, id => files.has(id))
  const command = (value: unknown) => store.command(computerCommand.parse(value))
  const bind = (account: string) => command({ action: 'bind', fields: { name: account, account, worker: 'Research', nativeUrl: 'https://grok.com/', instructions: 'Research only; request approval before external writes.' } }) as { binding: { id: string }; token: string }
  const a = bind('account-a'); const b = bind('account-b')
  const input = { id: randomUUID(), computerId: a.binding.id, objective: 'Research', context: 'Only public company facts', inputFileIds: [], expectedOutputs: ['Report'] }
  command({ action: 'create', job: input })
  const report = (action: string, revision: number, message = 'Report') => store.report(a.binding.id, computerReport.parse({ id: input.id, expectedRevision: revision, action, message }))
  return { db, files, store, command, bind, a, b, input, report }
}

test('claims resume the same assignment and credentials cannot select another computer', () => {
  const f = fixture()
  expect(f.store.authenticate(f.a.token)).toBe(f.a.binding.id)
  expect(() => f.store.authenticate('wrong')).toThrow('unauthorized')
  const first = f.store.claim(f.a.binding.id)
  expect(first.resumed).toBe(false)
  expect(f.store.claim(f.a.binding.id)).toEqual({ job: first.job, resumed: true })
  expect(f.store.claim(f.b.binding.id).job).toBeNull()
  expect(() => f.store.workerJob(f.input.id, f.b.binding.id)).toThrow('missing')
  expect(() => f.bind('ACCOUNT-A')).toThrow('duplicateAccount')
  f.command({ action: 'create', job: f.input })
  expect(f.store.jobs()).toHaveLength(1)
  expect(() => f.command({ action: 'create', job: { ...f.input, context: 'Different disclosure' } })).toThrow('conflict')
  expect(computerReport.safeParse({ id: f.input.id, expectedRevision: 2, action: 'succeed', message: 'Done' }).success).toBe(false)
})

test('stop requests reject late completion and require worker acknowledgement', () => {
  const f = fixture()
  f.store.claim(f.a.binding.id)
  f.command({ action: 'cancel', id: f.input.id, expectedRevision: 2, comment: 'Stop this task' })
  expect(f.store.job(f.input.id).state).toBe('CANCEL_REQUESTED')
  expect(() => f.report('submit_result', 2)).toThrow('conflict')
  expect(() => f.report('submit_result', 3)).toThrow('state')
  expect(f.report('confirm_stop', 3, 'Execution has stopped').state).toBe('CANCELLED')
  expect(() => f.report('progress', 4)).toThrow('state')
})

test('results require real deliverables and separate human acceptance', () => {
  const f = fixture()
  f.store.claim(f.a.binding.id)
  expect(() => f.report('submit_result', 2)).toThrow('missingOutput')
  const id = randomUUID(); f.files.add(id)
  const artifact = { fileId: id as Parameters<typeof f.store.attach>[3]['fileId'], output: 0, name: 'report.txt', size: 100, sha256: 'a'.repeat(64) }
  f.store.attach(f.a.binding.id, f.input.id, 2, artifact)
  expect(f.report('submit_result', 3).state).toBe('VERIFYING')
  f.files.delete(id)
  expect(() => f.command({ action: 'review', id: f.input.id, expectedRevision: 4, verdict: 'SUCCEEDED', comment: 'Checked' })).toThrow('missingOutput')
  f.files.add(id)
  f.command({ action: 'review', id: f.input.id, expectedRevision: 4, verdict: 'SUCCEEDED', comment: 'Read and verified' })
  expect(f.store.job(f.input.id).state).toBe('SUCCEEDED')
  expect(JSON.parse(String(f.db.prepare('SELECT data FROM enterprise_tasks WHERE id=?').get(f.store.job(f.input.id).taskId)?.data)).status).toBe('done')
})

test('approval gates worker continuation and rejects stale approved task content', () => {
  const f = fixture()
  f.store.claim(f.a.binding.id)
  const waiting = f.report('request_approval', 2, 'Send this exact draft to the named recipient')
  expect(() => f.report('progress', 3)).toThrow('approvalRequired')
  f.db.prepare('UPDATE enterprise_approvals SET data=? WHERE id=?').run(JSON.stringify({ status: 'approved', revision: 1 }), waiting.approvalTaskId!)
  const task = JSON.parse(String(f.db.prepare('SELECT data FROM enterprise_tasks WHERE id=?').get(waiting.approvalTaskId!)?.data))
  task.revision = 2
  f.db.prepare('UPDATE enterprise_tasks SET data=? WHERE id=?').run(JSON.stringify(task), task.id)
  expect(() => f.report('progress', 3)).toThrow('approvalRequired')
  task.revision = 1
  f.db.prepare('UPDATE enterprise_tasks SET data=? WHERE id=?').run(JSON.stringify(task), task.id)
  expect(f.report('progress', 3).state).toBe('RUNNING')
})

test('disconnect revokes access without claiming external execution has stopped', () => {
  const f = fixture()
  f.store.claim(f.a.binding.id)
  f.command({ action: 'disconnect', id: f.a.binding.id })
  expect(f.store.job(f.input.id).state).toBe('UNKNOWN')
  expect(() => f.store.authenticate(f.a.token)).toThrow('unauthorized')
  expect(() => f.store.claim(f.a.binding.id)).toThrow('unauthorized')
  const rotated = f.command({ action: 'rotate', id: f.a.binding.id }) as { token: string }
  expect(f.store.authenticate(rotated.token)).toBe(f.a.binding.id)
  expect(f.store.claim(f.a.binding.id).job?.state).toBe('UNKNOWN')
})
