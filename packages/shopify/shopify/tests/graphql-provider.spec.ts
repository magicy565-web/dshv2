import { describe, expect, it, vi } from 'vitest'
import { GraphqlStoreProvider } from '../src/graphql-provider.ts'
import { ShopifyApiError } from '../src/client.ts'

describe('GraphqlStoreProvider', () => {
  it('marks ambiguous writes as reconciliation failures rather than retryable requests', async () => {
    const execute = vi.fn().mockRejectedValue(new ShopifyApiError('transient', 'response lost'))
    const provider = new GraphqlStoreProvider({ execute } as never)
    const result = provider.publish({ mode: 'oauth' } as never, { themeId: 'gid://shopify/OnlineStoreTheme/1', files: { 'templates/index.liquid': 'Hello' } } as never)
    await expect(result).rejects.toThrow('outcome is unknown')
    await expect(result).rejects.not.toBeInstanceOf(ShopifyApiError)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('waits for asynchronous file writes and verifies the promoted theme', async () => {
    const id = 'gid://shopify/OnlineStoreTheme/1'
    const execute = vi.fn().mockResolvedValueOnce({ themeFilesUpsert: { upsertedThemeFiles: [], userErrors: [], job: { id: 'job', done: false } } })
      .mockResolvedValueOnce({ job: { id: 'job', done: false } })
      .mockResolvedValueOnce({ job: { id: 'job', done: true } })
      .mockResolvedValueOnce({ themePublish: { theme: { id }, userErrors: [] } })
      .mockResolvedValueOnce({ theme: { id, role: 'MAIN' } })
    const provider = new GraphqlStoreProvider({ execute } as never, 'oauth', { pollIntervalMs: 0, maxPollAttempts: 2, signal: new AbortController().signal })
    await expect(provider.publish({ mode: 'oauth' } as never, { themeId: id, files: { 'templates/index.liquid': 'Hello' }, idempotencyKey: 'revision' } as never)).resolves.toMatchObject({ filesWritten: 1 })
    expect(execute.mock.calls.map(call => String(call[0]).split('(')[0])).toEqual(['mutation ThemeFilesUpsert', 'query ThemeWriteJob', 'query ThemeWriteJob', 'mutation SiteThemePublish', 'query PublishedSiteTheme'])
  })
  it('does not promote when a pending write cannot be confirmed', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ themeFilesUpsert: { upsertedThemeFiles: [], userErrors: [], job: { id: 'job', done: false } } }).mockResolvedValue({ job: { id: 'job', done: false } })
    const provider = new GraphqlStoreProvider({ execute } as never, 'oauth', { pollIntervalMs: 0, maxPollAttempts: 1, signal: new AbortController().signal })
    await expect(provider.publish({ mode: 'oauth' } as never, { themeId: 'gid://shopify/OnlineStoreTheme/1', files: { 'templates/index.liquid': 'Hello' } } as never)).rejects.toThrow('still pending')
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it('maps product and collection projections without exposing mutable response data', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ products: { nodes: [{ id: 'p1', title: 'Tea', handle: 'tea', description: 'Leaf', featuredImage: { url: 'https://img' }, priceRange: { minVariantPrice: { amount: '4.00', currencyCode: 'USD' } }, totalInventory: 2 }] } })
      .mockResolvedValueOnce({ collections: { nodes: [{ id: 'c1', title: 'Tea', handle: 'tea', products: { nodes: [{ id: 'p1' }] } }] } })
    const provider = new GraphqlStoreProvider({ execute } as never)
    await expect(provider.listProducts({} as never)).resolves.toMatchObject([{ title: 'Tea', available: true }])
    await expect(provider.listCollections({} as never)).resolves.toMatchObject([{ productIds: ['p1'] }])
  })

  it('publishes approved OAuth theme files through themeFilesUpsert', async () => {
    const execute = vi.fn().mockResolvedValueOnce({ themeFilesUpsert: { upsertedThemeFiles: [{ filename: 'templates/product.json' }], userErrors: [] } })
      .mockResolvedValueOnce({ themePublish: { theme: { id: 'gid://shopify/OnlineStoreTheme/1' }, userErrors: [] } })
      .mockResolvedValueOnce({ theme: { id: 'gid://shopify/OnlineStoreTheme/1', role: 'MAIN' } })
    const provider = new GraphqlStoreProvider({ execute } as never)
    await expect(provider.publish({ mode: 'oauth', connectionId: 'connection' as never, tenantId: 'tenant' as never, requiredScopes: [] }, { connectionId: 'connection' as never, themeId: 'gid://shopify/OnlineStoreTheme/1' as never, files: { 'templates/product.json': '{}' }, idempotencyKey: 'revision-1' })).resolves.toMatchObject({ filesWritten: 1, version: 'revision-1' })
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('themeFilesUpsert'), expect.objectContaining({ themeId: 'gid://shopify/OnlineStoreTheme/1', files: [{ filename: 'templates/product.json', body: { type: 'TEXT', value: '{}' } }] }))
  })

  it('rejects public mode and unapproved theme paths before network calls', async () => {
    const execute = vi.fn()
    const provider = new GraphqlStoreProvider({ execute } as never, 'public')
    await expect(provider.publish({ mode: 'public' } as never, { themeId: 'gid://shopify/OnlineStoreTheme/1' as never, files: { 'templates/product.json': '{}' } } as never)).rejects.toThrow(/OAuth/)
    expect(execute).not.toHaveBeenCalled()
    const oauth = new GraphqlStoreProvider({ execute } as never)
    await expect(oauth.publish({ mode: 'oauth' } as never, { themeId: 'gid://shopify/OnlineStoreTheme/1' as never, files: { '../config/settings_data.json': '{}' } } as never)).rejects.toThrow(/unapproved/)
  })
})
