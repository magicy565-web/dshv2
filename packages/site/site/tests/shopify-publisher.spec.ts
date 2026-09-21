import { describe, expect, it, vi } from 'vitest'
import { StoreConnectionId, TenantId, ShopifyThemeId } from '../../../shopify/shopify/src/types.ts'
import { createShopifySitePublisher } from '../src/shopify-publisher.ts'

describe('createShopifySitePublisher', () => {
  it('renders and publishes one revision with a stable idempotency key', async () => {
    const publish = vi.fn().mockResolvedValue({})
    const publisher = createShopifySitePublisher({ publish } as never, ShopifyThemeId('gid://shopify/OnlineStoreTheme/9'), (_site, revision) => ({ 'templates/index.html': revision.id }))
    const site = { id: 'site' as never, tenantId: TenantId('tenant'), name: 'Store', connectionId: StoreConnectionId('connection') }
    await publisher(site, { id: 'revision' as never, siteId: site.id, createdAt: '2026-01-01T00:00:00Z', source: 'agent', changeSet: {} })
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ mode: 'oauth' }), expect.objectContaining({ themeId: 'gid://shopify/OnlineStoreTheme/9', idempotencyKey: 'site-revision:revision', files: { 'templates/index.html': 'revision' } }))
  })

  it('rejects an invalid theme before creating a publisher', () => {
    expect(() => createShopifySitePublisher({ publish: vi.fn() } as never, 'theme', () => ({}))).toThrow('invalid Shopify theme id')
  })
})
