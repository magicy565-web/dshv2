/** Exact review and restart recovery use isolated SQLite, without external store writes. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { InMemorySiteService } from '../../../packages/site/site/src/memory.ts'
import { SqliteSiteStateStore } from '../../../packages/site/site/src/sqlite.ts'
import { TenantId, StoreConnectionId, ShopifyThemeId } from '../../../packages/shopify/shopify/src/types.ts'
import { ShopifyApiError } from '../../../packages/shopify/shopify/src/client.ts'
import { PublicStoreProvider } from '../../../packages/shopify/shopify/src/providers.ts'
import { SiteShopifyWorker, siteShopifyConfig } from '../src/site-shopify.ts'

describe('Shopify site worker', () => {
  it('restores queued destinations, persists bounded retries, and never republishes a completed job', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'site-shopify-'))
    let storage = new SqliteSiteStateStore(join(directory, 'site.sqlite'))
    const ctx = new Context()
    try {
      let sites = new InMemorySiteService(ctx, undefined, storage)
      const site = sites.createSite(TenantId('enterprise'), 'Store')
      const spec = { tenantId: site.tenantId, siteId: site.id }
      const revision = await sites.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Store' }] }, 'user')
      const themeId = ShopifyThemeId('gid://shopify/OnlineStoreTheme/1')
      const connectionId = StoreConnectionId('store')
      const provider = new PublicStoreProvider([], [], [{ id: themeId, name: 'Candidate', role: 'unpublished' }])
      const publish = vi.spyOn(provider, 'publish').mockRejectedValueOnce(new ShopifyApiError('rate-limit', 'busy'))
      const access = { connections: () => [{ id: connectionId, name: 'Store' }], resolve: () => ({ provider, spec: { tenantId: site.tenantId, connectionId, mode: 'oauth' as const, requiredScopes: ['write_themes'] } }) }
      const config = siteShopifyConfig.parse({ retryDelayMs: 0 })
      let worker = new SiteShopifyWorker(sites, access, config)
      const signal = new AbortController().signal
      const review = await worker.review(spec, revision.id, { connectionId, themeId }, signal)
      const target = { connectionId, themeId, digest: review.digest }
      await expect(worker.queue(spec, revision.id, { ...target, digest: '0'.repeat(64) }, revision.id, signal)).rejects.toThrow('changed')
      const job = await worker.queue(spec, revision.id, target, revision.id, signal)
      storage.close(); storage = new SqliteSiteStateStore(join(directory, 'site.sqlite'))
      sites = new InMemorySiteService(new Context(), undefined, storage)
      worker = new SiteShopifyWorker(sites, access, config)
      await worker.tick([spec], signal)
      const completed = sites.getPublishJob(spec, job.id)!
      expect(completed.status).toBe('succeeded')
      expect(completed.attempts?.map(item => item.status)).toEqual(['failed', 'succeeded'])
      expect(sites.get(spec)?.publishedRevisionId).toBe(revision.id)
      expect(storage.load()?.jobs[0]?.attempts).toEqual(completed.attempts)
      await worker.tick([spec], signal)
      expect(publish).toHaveBeenCalledTimes(2)
      expect(publish.mock.calls[0]![1]).toEqual(publish.mock.calls[1]![1])
      const next = await sites.createRevision(spec, { baseRevisionId: revision.id, pages: [{ id: 'home', kind: 'home', path: '/', title: 'Changed' }] }, 'user')
      await expect(worker.queue(spec, revision.id, target, revision.id, signal)).rejects.toThrow('changed')
      const nextReview = await worker.review(spec, next.id, target, signal)
      const failed = await worker.queue(spec, next.id, { ...target, digest: nextReview.digest }, next.id, signal)
      publish.mockRejectedValue(new ShopifyApiError('permission', 'denied'))
      await worker.tick([spec], signal)
      expect(sites.getPublishJob(spec, failed.id)?.attempts).toHaveLength(1)
      expect(sites.get(spec)?.publishedRevisionId).toBe(revision.id)
    } finally { storage.close(); await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) }
  })
  it('refuses source projects and a theme that became live after review', async () => {
    const sites = new InMemorySiteService(new Context())
    const tenantId = TenantId('enterprise')
    const site = sites.createSiteWithProject(tenantId, 'Source', { framework: 'static', files: [{ path: 'index.html', encoding: 'utf8', content: 'Hello' }] }, 'user')
    const themeId = ShopifyThemeId('gid://shopify/OnlineStoreTheme/1')
    const connectionId = StoreConnectionId('store')
    const provider = new PublicStoreProvider([], [], [{ id: themeId, name: 'Live', role: 'main' }])
    const publish = vi.spyOn(provider, 'publish')
    const worker = new SiteShopifyWorker(sites, { connections: () => [], resolve: () => ({ provider, spec: { mode: 'oauth', tenantId, connectionId, requiredScopes: [] } }) }, siteShopifyConfig.parse({}))
    const signal = new AbortController().signal
    await expect(worker.review({ tenantId, siteId: site.id }, site.currentRevisionId!, { connectionId, themeId }, signal)).rejects.toThrow('controlled pages')
    const controlled = sites.createSite(tenantId, 'Controlled')
    const spec = { tenantId, siteId: controlled.id }
    const revision = await sites.createRevision(spec, { pages: [{ id: 'home', kind: 'home', path: '/', title: 'Home' }] }, 'user')
    await expect(worker.review(spec, revision.id, { connectionId, themeId }, signal)).rejects.toThrow('unpublished')
    expect(publish).not.toHaveBeenCalled()
  })
})
