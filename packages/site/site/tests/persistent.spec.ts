/** Cordis owns the lifetime of the persistent draft service. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { TenantId, StoreConnectionId } from '../../../shopify/shopify/src/types.ts'
import PersistentSiteService from '../src/persistent.ts'

describe('persistent site plugin', () => {
  it('restores drafts after disposal and remount', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-site-plugin-'))
    const ctx = new Context()
    try {
      const config = { databasePath: join(directory, 'site.sqlite') }
      const first = ctx.plugin(PersistentSiteService, config)
      await first
      const site = ctx.site.createSite(TenantId('one'), 'Store', StoreConnectionId('store'))
      const spec = ctx.site.resolve({ tenantId: site.tenantId, siteId: site.id })
      const revision = await ctx.site.createRevision(spec, { pages: [] }, 'user')
      const job = await ctx.site.queuePublishJob(spec, revision.id)
      await first.dispose()
      expect(ctx.get('site')).toBeUndefined()
      const second = ctx.plugin(PersistentSiteService, config)
      await second
      expect(ctx.site.getRevision(spec, revision.id)).toEqual(revision)
      expect(ctx.site.getPublishJob(spec, job.id)).toEqual(job)
      await second.dispose()
      expect(ctx.get('site')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects relative database locations', () => {
    expect(() => new PersistentSiteService(new Context(), { databasePath: 'site.sqlite' })).toThrow('absolute filename')
  })
})
