/** Provider retries and publication target selection. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { InMemorySiteService } from '../../site/src/memory.ts'
import { SitePublishWorkflow } from '../src/index.ts'
import { InMemoryShopifyStoreService, PublicStoreProvider } from '../../../shopify/shopify/src/providers.ts'
import { ShopifyApiError } from '../../../shopify/shopify/src/client.ts'
import { StoreConnectionId, TenantId, ShopifyThemeId } from '../../../shopify/shopify/src/types.ts'

async function fixture() {
  const sites = new InMemorySiteService(new Context())
  const site = sites.createSite(TenantId('platform'), 'Demo', StoreConnectionId('public-store'))
  const spec = sites.resolve({ tenantId: site.tenantId, siteId: site.id })
  const revision = await sites.createRevision(spec, { pages: [] }, 'user')
  const job = await sites.queuePublishJob(spec, revision.id)
  const themeId = ShopifyThemeId('selected-theme')
  const provider = new PublicStoreProvider([], [], [{ id: themeId, name: 'Selected', role: 'unpublished' }])
  const shopify = new InMemoryShopifyStoreService(new Context(), provider)
  const options = { themeId, publicOrigin: 'https://shop.example', maxAttempts: 3, retryDelayMs: 0 }
  return { sites, spec, revision, job, provider, shopify, options }
}

describe('site workflow', () => {
  it('stops transient failures at the configured attempt limit', async () => {
    const f = await fixture()
    const publish = vi.spyOn(f.provider, 'publish').mockRejectedValue(new ShopifyApiError('rate-limit', 'busy'))
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, f.options)
    expect((await workflow.run(f.spec, f.revision, f.job)).status).toBe('failed')
    expect(f.sites.getPublishJob(f.spec, f.job.id)?.status).toBe('failed')
    expect(publish).toHaveBeenCalledTimes(3)
    expect(workflow.history(f.job.id)).toHaveLength(3)
  })

  it('rejects concurrent revisions of the same site', async () => {
    const f = await fixture()
    const pending = Promise.withResolvers<void>()
    const original = f.provider.publish.bind(f.provider)
    vi.spyOn(f.provider, 'publish').mockImplementation(async (spec, request) => { await pending.promise; return original(spec, request) })
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, f.options)
    const first = workflow.run(f.spec, f.revision, f.job)
    try {
      const revision = await f.sites.createRevision(f.spec, {}, 'user')
      const job = await f.sites.queuePublishJob(f.spec, revision.id)
      await expect(workflow.run(f.spec, revision, job)).rejects.toThrow('already running')
    } finally {
      pending.resolve()
      await first
    }
  })

  it('retries transient failures with the same idempotency key and selected theme', async () => {
    const f = await fixture()
    const publish = vi.spyOn(f.provider, 'publish').mockRejectedValueOnce(new ShopifyApiError('transient', 'offline'))
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, f.options)
    expect((await workflow.run(f.spec, f.revision, f.job)).status).toBe('succeeded')
    expect(f.sites.getPublishJob(f.spec, f.job.id)?.status).toBe('succeeded')
    expect(publish).toHaveBeenCalledTimes(2)
    expect(publish.mock.calls[0]![1].idempotencyKey).toBe(publish.mock.calls[1]![1].idempotencyKey)
    expect(publish.mock.calls[1]![1].themeId).toBe(f.options.themeId)
    expect(workflow.history(f.job.id).map(item => item.status)).toEqual(['failed', 'succeeded'])
  })

  it('does not retry permission failures or unknown exceptions', async () => {
    for (const error of [new ShopifyApiError('permission', 'denied'), new Error('unsupported')]) {
      const f = await fixture()
      const publish = vi.spyOn(f.provider, 'publish').mockRejectedValue(error)
      const workflow = new SitePublishWorkflow(f.sites, f.shopify, f.options)
      expect((await workflow.run(f.spec, f.revision, f.job)).status).toBe('failed')
      expect(publish).toHaveBeenCalledTimes(1)
    }
  })

  it('rejects a missing selected theme without calling publication', async () => {
    const f = await fixture()
    const publish = vi.spyOn(f.provider, 'publish')
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, { ...f.options, themeId: ShopifyThemeId('missing') })
    expect((await workflow.run(f.spec, f.revision, f.job)).status).toBe('failed')
    expect(publish).not.toHaveBeenCalled()
  })

  it('does not repeat a successful publication when the audit callback fails', async () => {
    const f = await fixture()
    const publish = vi.spyOn(f.provider, 'publish')
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, { ...f.options, onAudit: () => { throw new Error('audit unavailable') } })
    await expect(workflow.run(f.spec, f.revision, f.job)).rejects.toThrow('audit unavailable')
    expect(publish).toHaveBeenCalledTimes(1)
    expect(workflow.history(f.job.id)[0]?.status).toBe('succeeded')
  })

  it('rejects forged revision contents before any provider call', async () => {
    const f = await fixture()
    const publish = vi.spyOn(f.provider, 'publish')
    const workflow = new SitePublishWorkflow(f.sites, f.shopify, f.options)
    await expect(workflow.run(f.spec, { ...f.revision, changeSet: {} }, f.job)).rejects.toThrow('stored site state')
    expect(publish).not.toHaveBeenCalled()
  })
})
