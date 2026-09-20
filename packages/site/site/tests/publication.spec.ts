/** Publication ownership, commit timing, and interrupted-job recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { StoreConnectionId, TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'

function setup(publisher?: ConstructorParameters<typeof InMemorySiteService>[1]) {
  const service = new InMemorySiteService(new Context(), publisher)
  const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
  const spec = service.resolve({ tenantId: site.tenantId, siteId: site.id })
  return { service, spec }
}

describe('site publication lifecycle', () => {
  it('requires a publisher without recording a false success', async () => {
    const { service, spec } = setup()
    const revision = await service.createRevision(spec, { pages: [] }, 'user')
    await expect(service.publish(spec, revision.id)).rejects.toThrow('publisher is not configured')
    expect(service.listPublishJobs(spec)).toEqual([])
    expect(service.get(spec)?.publishedRevisionId).toBeUndefined()
  })

  it('coalesces queued requests and cancels without invoking the publisher', async () => {
    let calls = 0
    const { service, spec } = setup(async () => { calls++ })
    const revision = await service.createRevision(spec, {}, 'user')
    const job = await service.queuePublishJob(spec, revision.id)
    expect(await service.queuePublishJob(spec, revision.id)).toEqual(job)
    expect((await service.cancelPublishJob(spec, job.id)).status).toBe('cancelled')
    await expect(service.runPublishJob(spec, job.id)).rejects.toThrow('cancelled')
    expect(calls).toBe(0)
    const next = await service.queuePublishJob(spec, revision.id)
    expect(service.listPublishJobs(spec).map(item => item.id)).toEqual([next.id, job.id])
  })

  it('rejects cross-tenant publication and job operations', async () => {
    const { service, spec } = setup(async () => {})
    const revision = await service.createRevision(spec, {}, 'user')
    const job = await service.queuePublishJob(spec, revision.id)
    const other = { ...spec, tenantId: TenantId('other') }
    await expect(service.queuePublishJob(other, revision.id)).rejects.toThrow('tenant')
    await expect(service.runPublishJob(other, job.id)).rejects.toThrow('tenant')
    await expect(service.cancelPublishJob(other, job.id)).rejects.toThrow('tenant')
    expect(service.listPublishJobs(other)).toEqual([])
    expect(service.listRevisions(other)).toEqual([])
  })

  it('retains the prior publication after a provider failure', async () => {
    let fail = false
    const { service, spec } = setup(async () => { if (fail) throw new Error('provider unavailable') })
    const first = await service.createRevision(spec, {}, 'user')
    expect((await service.publish(spec, first.id)).status).toBe('succeeded')
    fail = true
    const next = await service.createRevision(spec, { baseRevisionId: first.id }, 'user')
    const failed = await service.publish(spec, next.id)
    expect(failed.status).toBe('failed')
    expect(failed.error).toContain('provider unavailable')
    expect(service.get(spec)).toMatchObject({ currentRevisionId: next.id, publishedRevisionId: first.id })
  })

  it('holds a site-wide lock and preserves edits made while publication is pending', async () => {
    const pending = Promise.withResolvers<undefined>()
    const { service, spec } = setup(() => pending.promise)
    const first = await service.createRevision(spec, {}, 'user')
    const job = await service.queuePublishJob(spec, first.id)
    const run = service.runPublishJob(spec, job.id)
    try {
      expect(service.getPublishJob(spec, job.id)?.status).toBe('running')
      const second = await service.createRevision(spec, { baseRevisionId: first.id }, 'user')
      const next = await service.queuePublishJob(spec, second.id)
      await expect(service.runPublishJob(spec, next.id)).rejects.toThrow('already running')
      await expect(service.cancelPublishJob(spec, job.id)).rejects.toThrow('running')
      expect(() =>{  service.restore(service.snapshot()) }).toThrow('during publication')
      const restored = setup().service
      restored.restore(service.snapshot())
      const interrupted = restored.getPublishJob(spec, job.id)
      expect(interrupted).toMatchObject({ status: 'failed' })
      expect(interrupted?.error).toContain('interrupted')
      expect(restored.getPublishJob(spec, next.id)?.status).toBe('queued')
      pending.resolve(undefined)
      await run
      expect(service.get(spec)).toMatchObject({ currentRevisionId: second.id, publishedRevisionId: first.id })
    } finally {
      pending.resolve(undefined)
      await run
    }
  })

  it('keeps revisions immutable across inputs, returned values, and snapshots', async () => {
    const { service, spec } = setup()
    const pages = [{ id: 'home', kind: 'home' as const, path: '/', title: 'Original' }]
    const revision = await service.createRevision(spec, { pages }, 'user')
    pages[0]!.title = 'Changed input'
    const snapshot = service.snapshot()
    Object.assign(snapshot.revisions[0]!.changeSet.pages![0]!, { title: 'Changed snapshot' })
    Object.assign(revision.changeSet.pages![0]!, { title: 'Changed return' })
    expect(service.getRevision(spec, revision.id)?.changeSet.pages?.[0]?.title).toBe('Original')
    const restored = setup().service
    restored.restore(service.snapshot())
    const second = await service.createRevision(spec, { baseRevisionId: revision.id }, 'user')
    expect(service.listRevisions(spec).map(item => item.id)).toEqual([second.id, revision.id])
    expect(restored.getRevision(spec, revision.id)?.changeSet.pages?.[0]?.title).toBe('Original')
  })
})
