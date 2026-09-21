/** Management and its durable outbox share the same source transaction. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { parseSiteSnapshot } from '../src/snapshot.ts'
import { siteStateChangeSchema, siteProjection } from '../src/session.ts'
import { SessionSeq } from '../../../core/session/src/types.ts'

describe('site management', () => {
  it('checks metadata versions, retains archived source and records deletion for cleanup', async () => {
    const sites = new InMemorySiteService(new Context())
    const site = sites.createSite(TenantId('owner'), 'Original')
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const revision = await sites.createRevision(spec, { pages: [] }, 'user')
    sites.manage(spec, 0, { name: 'Renamed' })
    expect(() => sites.manage(spec, 0, { name: 'Stale' })).toThrow('conflict')
    expect(() => sites.manage({ ...spec, tenantId: TenantId('other') }, 1, { archived: true })).toThrow()
    const job = await sites.queuePublishJob(spec, revision.id)
    expect(() => sites.manage(spec, 1, { archived: true })).toThrow('pending')
    await sites.cancelPublishJob(spec, job.id)
    sites.manage(spec, 1, { archived: true })
    expect(sites.content(spec, revision.id).pages).toEqual([])
    await expect(sites.createRevision(spec, { baseRevisionId: revision.id }, 'user')).rejects.toThrow('archived')
    await expect(sites.queuePublishJob(spec, revision.id)).rejects.toThrow('archived')
    const restored = new InMemorySiteService(new Context())
    restored.restore(sites.snapshot())
    restored.deleteSite(spec, 2)
    expect(restored.get(spec)).toBeUndefined()
    expect(restored.snapshot().deletedSites).toEqual([spec])
    const last = restored.pendingChanges().at(-1)!
    expect(siteStateChangeSchema.parse(last)).toMatchObject({ site: null, revisions: [], jobs: [] })
    expect(parseSiteSnapshot(restored.snapshot())).toEqual(restored.snapshot())
    restored.acknowledgeChanges(last.sequence)
    expect(restored.pendingChanges()).toEqual([])
  })
  it('rolls back metadata and outbox together when storage refuses the commit', () => {
    let fail = false
    const sites = new InMemorySiteService(new Context(), undefined, { load: () => undefined, commit: () => { if (fail) throw new Error('disk unavailable') } })
    const site = sites.createSite(TenantId('owner'), 'Saved')
    const before = sites.snapshot()
    fail = true
    expect(() => sites.manage({ tenantId: site.tenantId, siteId: site.id }, 0, { archived: true })).toThrow('disk unavailable')
    expect(sites.snapshot()).toEqual(before)
    expect(() => sites.acknowledgeChanges(1)).toThrow('disk unavailable')
    expect(sites.snapshot()).toEqual(before)
  })
  it('rejects corrupt outbox ownership and dangling revision references', () => {
    const sites = new InMemorySiteService(new Context())
    sites.createSite(TenantId('owner'), 'Saved')
    const snapshot = sites.snapshot()
    const change = snapshot.pendingChanges![0]!
    const event = { type: 'site/state' as const, seq: SessionSeq(0), time: 0, data: change }
    const projected = siteProjection.apply(null, event)
    expect(projected).toEqual(change)
    expect(() => siteProjection.apply(projected, event)).toThrow('sequence')
    expect(() => parseSiteSnapshot({ ...snapshot, pendingChanges: [{ ...snapshot.pendingChanges![0], tenantId: 'other' }] })).toThrow()
    expect(() => parseSiteSnapshot({ ...snapshot, changeSequence: 0 })).toThrow()
    expect(() => siteStateChangeSchema.parse({ ...snapshot.pendingChanges![0], jobs: [{ id: 'job', siteId: snapshot.sites[0]!.id, revisionId: 'missing', status: 'queued' }] })).toThrow()
  })
})
