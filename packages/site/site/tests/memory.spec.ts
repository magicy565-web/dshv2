import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { TenantId, StoreConnectionId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { SiteId } from '../src/types.ts'

describe('InMemorySiteService', () => {
  it('enforces tenant isolation and revision conflicts', async () => {
    const service = new InMemorySiteService(new Context())
    const site = service.createSite(TenantId('t1'), 'Demo', StoreConnectionId('c1'))
    expect(service.list(TenantId('t2'))).toEqual([])
    const spec = service.resolve({ tenantId: TenantId('t1'), siteId: site.id })
    const revision = await service.createRevision(spec, { pages: [] }, 'user')
    await expect(service.createRevision(spec, { baseRevisionId: SiteId('wrong') as never }, 'agent')).rejects.toThrow(/conflict/)
    expect(service.getRevision(spec, revision.id)).toEqual(revision)
  })

  it('round-trips durable state through a snapshot', async () => {
    const source = new InMemorySiteService(new Context())
    const site = source.createSite(TenantId('t1'), 'Demo', StoreConnectionId('c1'))
    const spec = source.resolve({ tenantId: TenantId('t1'), siteId: site.id })
    const revision = await source.createRevision(spec, { pages: [] }, 'user')
    const snapshot = source.snapshot()
    const restored = new InMemorySiteService(new Context())
    restored.restore(snapshot)
    expect(restored.getRevision(spec, revision.id)).toEqual(revision)
    expect(restored.list(TenantId('t1'))).toEqual([source.get(spec)])
  })

  it('creates a new rollback revision without replacing history', async () => {
    const service = new InMemorySiteService(new Context())
    const site = service.createSite(TenantId('t1'), 'Demo', StoreConnectionId('c1'))
    const spec = service.resolve({ tenantId: TenantId('t1'), siteId: site.id })
    const first = await service.createRevision(spec, { pages: [{ id: 'h', kind: 'home', path: '/', title: 'Home' }] }, 'user')
    await service.createRevision(spec, { baseRevisionId: first.id, pages: [{ id: 'h', kind: 'home', path: '/', title: 'Changed' }] }, 'user')
    const rollback = await service.rollback(spec, first.id)
    expect(rollback.source).toBe('rollback')
    expect(rollback.changeSet.pages?.[0]?.title).toBe('Home')
    expect(service.listRevisions(spec)).toHaveLength(3)
  })
})
