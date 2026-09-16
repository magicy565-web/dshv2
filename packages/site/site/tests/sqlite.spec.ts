/** Durable site writes and stale-writer rejection using real SQLite files. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { StoreConnectionId, TenantId } from '../../../shopify/shopify/src/types.ts'
import { InMemorySiteService } from '../src/memory.ts'
import { SqliteSiteStateStore } from '../src/sqlite.ts'

describe('SQLite site state', () => {
  it('restores automatically committed sites, revisions, jobs and publication after reopening', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-db-'))
    const path = join(directory, 'site.sqlite')
    let storage = new SqliteSiteStateStore(path)
    try {
      const service = new InMemorySiteService(new Context(), async () => {}, storage)
      const site = service.createSite(TenantId('owner'), 'Store', StoreConnectionId('store'))
      const spec = service.resolve({ tenantId: site.tenantId, siteId: site.id })
      const revision = await service.createRevision(spec, { pages: [] }, 'user')
      await service.publish(spec, revision.id)
      const expected = service.snapshot()
      storage.close()
      storage = new SqliteSiteStateStore(path)
      const restored = new InMemorySiteService(new Context(), undefined, storage)
      expect(restored.snapshot()).toEqual(expected)
      expect(restored.list(TenantId('other'))).toEqual([])
    } finally {
      storage.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a stale writer without changing its memory or overwriting durable state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-conflict-'))
    const path = join(directory, 'site.sqlite')
    const first = new SqliteSiteStateStore(path)
    const second = new SqliteSiteStateStore(path)
    try {
      const owner = new InMemorySiteService(new Context(), undefined, first)
      const stale = new InMemorySiteService(new Context(), undefined, second)
      owner.createSite(TenantId('one'), 'One', StoreConnectionId('one'))
      expect(() => stale.createSite(TenantId('two'), 'Two', StoreConnectionId('two'))).toThrow('another writer')
      expect(stale.snapshot().sites).toEqual([])
      expect(first.load()).toEqual(owner.snapshot())
    } finally {
      first.close(); second.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not call a publisher if the running-state transaction fails', async () => {
    const storage = new SqliteSiteStateStore(':memory:')
    let calls = 0
    const service = new InMemorySiteService(new Context(), async () => { calls++ }, storage)
    const site = service.createSite(TenantId('one'), 'One', StoreConnectionId('one'))
    const spec = { tenantId: site.tenantId, siteId: site.id }
    const revision = await service.createRevision(spec, {}, 'user')
    const job = await service.queuePublishJob(spec, revision.id)
    storage.close()
    await expect(service.runPublishJob(spec, job.id)).rejects.toThrow()
    expect(calls).toBe(0)
    expect(service.getPublishJob(spec, job.id)?.status).toBe('queued')
    expect(service.get(spec)?.publishedRevisionId).toBeUndefined()
  })

  it('rejects a future schema without changing its version', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-future-'))
    const path = join(directory, 'site.sqlite')
    const database = new DatabaseSync(path)
    try {
      database.exec('PRAGMA user_version = 99')
      expect(() => new SqliteSiteStateStore(path)).toThrow('unsupported site database version')
      expect(database.prepare('PRAGMA user_version').get()?.user_version).toBe(99)
    } finally {
      database.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
