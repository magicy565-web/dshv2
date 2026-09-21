/** Wake acknowledgements cannot complete jobs or replay ambiguous provider requests. */
import { afterEach, expect, test, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { computerRoutines, resolveComputerRoutines, nextComputerJob } from '../src/computer-routines.ts'
import { computerBinding, computerJob } from '../src/computer-schema.ts'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
function fixture(send: typeof fetch) {
  const db = new DatabaseSync(':memory:'); databases.push(db)
  db.exec('CREATE TABLE enterprise_computers(id TEXT PRIMARY KEY,kind TEXT,data TEXT)')
  const binding = computerBinding.parse({ id: randomUUID(), provider: 'grokbot', enabled: true, name: 'One', account: 'one', worker: 'Research', nativeUrl: 'https://grok.com', instructions: 'Research', createdAt: new Date().toISOString() })
  const job = computerJob.parse({ id: randomUUID(), computerId: binding.id, objective: 'Research', context: 'Public pages', inputFileIds: [], expectedOutputs: ['Report'], taskId: randomUUID(), revision: 1, state: 'QUEUED', instructions: '', contextVersion: 'v1', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastProgressAt: null, progress: '', result: '', artifacts: [], approvalTaskId: null, approvalAction: '' })
  const endpoints = resolveComputerRoutines([{ account: 'one', urlEnv: 'ONE_URL', keyEnv: 'ONE_KEY' }, { account: 'two', urlEnv: 'TWO_URL', keyEnv: 'TWO_KEY' }], { ONE_URL: 'https://one.example/hook', ONE_KEY: 'secret-one', TWO_URL: 'https://two.example/hook', TWO_KEY: 'secret-two' })
  return { db, binding, job, endpoints, service: computerRoutines(db, endpoints, 1000, send) }
}

test('concurrent and repeated creates send once to the correct account without declaring execution', async () => {
  let finish!: (response: Response) => void
  const send = vi.fn<typeof fetch>(() => new Promise(resolve => { finish = resolve }))
  const f = fixture(send)
  const first = f.service.wake(f.binding, f.job, new AbortController().signal)
  expect((await f.service.wake(f.binding, f.job, new AbortController().signal))?.state).toBe('sending')
  finish(new Response('private provider response', { status: 200 }))
  expect((await first)?.state).toBe('accepted')
  await f.service.wake(f.binding, f.job, new AbortController().signal)
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[0]).toBe('https://one.example/hook')
  expect(send.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', headers: { authorization: 'Bearer secret-one' } })
  expect(send.mock.calls[0]?.[1]?.body).not.toContain('Public pages')
  expect(JSON.stringify(f.service.list())).not.toMatch(/secret|private provider/)
  expect(f.job.state).toBe('QUEUED')
  const second = { ...f.binding, id: computerBinding.shape.id.parse(randomUUID()), account: 'two' }
  send.mockResolvedValue(new Response(null, { status: 200 }))
  await f.service.wake(second, { ...f.job, id: computerJob.shape.id.parse(randomUUID()), computerId: second.id }, new AbortController().signal)
  expect(send.mock.calls[1]?.[0]).toBe('https://two.example/hook')
  expect(send.mock.calls[1]?.[1]?.headers).toMatchObject({ authorization: 'Bearer secret-two' })
})

test('lost replies and interrupted deliveries remain unknown across restart, even on explicit retry', async () => {
  const send = vi.fn<typeof fetch>().mockRejectedValue(new Error('transport secret'))
  const f = fixture(send)
  expect((await f.service.wake(f.binding, f.job, new AbortController().signal))?.state).toBe('unknown')
  const restarted = computerRoutines(f.db, f.endpoints, 1000, send)
  await restarted.wake(f.binding, { ...f.job, revision: 2 }, new AbortController().signal, true)
  expect(send).toHaveBeenCalledTimes(1)
  f.db.prepare('UPDATE enterprise_computers SET data=?').run(JSON.stringify({ ...f.service.list()[0], state: 'sending' }))
  expect(computerRoutines(f.db, f.endpoints, 1000, send).list()[0]?.state).toBe('unknown')
})

test('rejections need an explicit retry; disabled, wrong-account and completed jobs never wake', async () => {
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://other.example' } }))
  const f = fixture(send)
  expect((await f.service.wake(f.binding, f.job, new AbortController().signal))?.state).toBe('rejected')
  await f.service.wake(f.binding, f.job, new AbortController().signal)
  expect(send).toHaveBeenCalledTimes(1)
  send.mockResolvedValue(new Response(null, { status: 200 }))
  await f.service.wake(f.binding, f.job, new AbortController().signal, true)
  expect(send).toHaveBeenCalledTimes(2)
  for (const [binding, job] of [[{ ...f.binding, enabled: false }, f.job], [f.binding, { ...f.job, state: 'SUCCEEDED' as const }], [{ ...f.binding, account: 'missing' }, f.job]] as const) {
    expect(await f.service.wake(binding, job, new AbortController().signal)).toBeNull()
  }
  expect(send).toHaveBeenCalledTimes(2)
})

test('invalid deployment credentials and duplicate accounts fail before sending', () => {
  const config = { account: 'one', urlEnv: 'URL', keyEnv: 'KEY' }
  for (const URL of ['http://example.com', 'https://secret@example.com', 'https://example.com/#secret', 'bad']) {
    expect(() => resolveComputerRoutines([config], { URL, KEY: 'secret' })).toThrow()
  }
  expect(() => resolveComputerRoutines([config], { URL: 'https://example.com' })).toThrow()
  expect(() => resolveComputerRoutines([config, { ...config, account: 'ONE' }], { URL: 'https://example.com', KEY: 'secret' })).toThrow('Duplicate')
})

test('queue handoff waits for acceptance or confirmed termination and stays within its account', () => {
  const f = fixture(vi.fn<typeof fetch>())
  const next = { ...f.job, id: computerJob.shape.id.parse(randomUUID()) }
  for (const state of ['RUNNING', 'WAITING_APPROVAL', 'WAITING_HUMAN', 'CANCEL_REQUESTED', 'VERIFYING', 'UNKNOWN'] as const) {
    expect(nextComputerJob([{ ...f.job, state }, next], f.binding.id)).toBeUndefined()
  }
  for (const state of ['SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED'] as const) {
    expect(nextComputerJob([{ ...f.job, state }, next], f.binding.id)).toEqual(next)
  }
  expect(nextComputerJob([f.job, next], f.binding.id)).toEqual(f.job)
  expect(nextComputerJob([f.job], randomUUID())).toBeUndefined()
})
