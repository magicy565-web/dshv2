import { describe, expect, it, vi } from 'vitest'
import { GraphqlStoreProvider } from '../src/graphql-provider.ts'

describe('GraphqlStoreProvider', () => {
  it('maps product and collection projections without exposing mutable response data', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ products: { nodes: [{ id: 'p1', title: 'Tea', handle: 'tea', description: 'Leaf', featuredImage: { url: 'https://img' }, priceRange: { minVariantPrice: { amount: '4.00', currencyCode: 'USD' } }, totalInventory: 2 }] } })
      .mockResolvedValueOnce({ collections: { nodes: [{ id: 'c1', title: 'Tea', handle: 'tea', products: { nodes: [{ id: 'p1' }] } }] } })
    const provider = new GraphqlStoreProvider({ execute } as never)
    await expect(provider.listProducts({} as never)).resolves.toMatchObject([{ title: 'Tea', available: true }])
    await expect(provider.listCollections({} as never)).resolves.toMatchObject([{ productIds: ['p1'] }])
  })

  it('publishes approved OAuth theme files through themeFilesUpsert', async () => {
    const execute = vi.fn().mockResolvedValue({ themeFilesUpsert: { upsertedThemeFiles: [{ filename: 'templates/product.json' }], userErrors: [] } })
    const provider = new GraphqlStoreProvider({ execute } as never)
    await expect(provider.publish({ mode: 'oauth', connectionId: 'connection' as never, tenantId: 'tenant' as never, requiredScopes: [] }, { connectionId: 'connection' as never, themeId: 'gid://shopify/Theme/1' as never, files: { 'templates/product.json': '{}' }, idempotencyKey: 'revision-1' })).resolves.toMatchObject({ filesWritten: 1, version: 'revision-1' })
    expect(execute).toHaveBeenCalledWith(expect.stringContaining('themeFilesUpsert'), expect.objectContaining({ theme: 'gid://shopify/Theme/1', files: [{ filename: 'templates/product.json', body: '{}' }] }))
  })

  it('rejects public mode and unapproved theme paths before network calls', async () => {
    const execute = vi.fn()
    const provider = new GraphqlStoreProvider({ execute } as never, 'public')
    await expect(provider.publish({ mode: 'public' } as never, { themeId: 'gid://shopify/Theme/1' as never, files: { 'templates/product.json': '{}' } } as never)).rejects.toThrow(/OAuth/)
    expect(execute).not.toHaveBeenCalled()
    const oauth = new GraphqlStoreProvider({ execute } as never)
    await expect(oauth.publish({ mode: 'oauth' } as never, { themeId: 'gid://shopify/Theme/1' as never, files: { '../config/settings_data.json': '{}' } } as never)).rejects.toThrow(/unapproved/)
  })
})
