import { describe, expect, it } from 'vitest'
import { GrokbotTaskService, type GrokbotTask } from '../src/index.ts'

function harness(initial: GrokbotTask[] = []) {
  let state = { tasks: initial }
  const service = Object.create(GrokbotTaskService.prototype) as GrokbotTaskService
  Object.defineProperty(service, 'readyDomain', { value: Promise.resolve({ global: { get: () => state, set: async (next: typeof state) => { state = next } } }) })
  return { service, read: () => state.tasks }
}

describe('Grokbot task lifecycle', () => {
  it('creates idempotently and claims once', async () => {
    const { service, read } = harness()
    const request = { workflowId: 'billing', nodeId: 'open', idempotencyKey: 'billing-1', input: { url: 'https://example.test' }, expiresAt: new Date(Date.now() + 60_000).toISOString() }
    const first = await service.create(request)
    expect(await service.create(request)).toEqual(first)
    const claimed = await service.claim(30)
    expect(claimed).toMatchObject({ taskId: first.taskId, status: 'leased', attempt: 1 })
    expect(await service.claim(30)).toBeUndefined()
    expect(read()).toHaveLength(1)
  })

  it('requires the current token and attempt, then ignores duplicate terminal callbacks', async () => {
    const { service } = harness()
    const task = await service.create({ workflowId: 'w', nodeId: 'n', idempotencyKey: 'k', input: null, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const claimed = await service.claim(30)
    await expect(service.complete(task.taskId, 'wrong', { status: 'succeeded', attempt: claimed!.attempt })).rejects.toThrow('invalid task token')
    const done = await service.complete(task.taskId, claimed!.callbackToken, { status: 'succeeded', attempt: claimed!.attempt, output: { ok: true } })
    expect(done.status).toBe('succeeded')
    expect(await service.complete(task.taskId, claimed!.callbackToken, { status: 'failed', attempt: claimed!.attempt })).toEqual(done)
  })

  it('cancels active work and rejects stale attempts', async () => {
    const { service } = harness()
    const task = await service.create({ workflowId: 'w', nodeId: 'n', idempotencyKey: 'k', input: null, expiresAt: new Date(Date.now() + 60_000).toISOString() })
    const claimed = await service.claim(30)
    await expect(service.complete(task.taskId, claimed!.callbackToken, { status: 'failed', attempt: 0 })).rejects.toThrow('stale task attempt')
    expect(await service.cancel(task.taskId)).toBe(true)
    expect(await service.cancel(task.taskId)).toBe(false)
  })
})
