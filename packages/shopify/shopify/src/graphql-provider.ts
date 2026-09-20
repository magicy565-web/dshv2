import type { ShopifyGraphqlClient } from './client.ts'
import type { CollectionSummary, ProductSummary, PublishRequest, PublishResult, ShopifyStoreSpec, ThemeSummary } from './types.ts'
import type { ShopifyStoreProvider } from './service.ts'
import { ShopifyProductId, ShopifyCollectionId, ShopifyThemeId } from './types.ts'

type ProductNode = {
  id: string
  title: string
  handle: string
  description: string
  featuredImage?: { url: string }
  priceRange: { minVariantPrice: { amount: string; currencyCode: string } }
  totalInventory?: number
}

/** Storefront/Admin GraphQL catalog provider. Theme writes remain an explicit Admin capability. */
export class GraphqlStoreProvider implements ShopifyStoreProvider {
  constructor(private readonly client: ShopifyGraphqlClient, readonly mode: 'public' | 'oauth' = 'oauth') {}
  async listProducts(_spec: ShopifyStoreSpec): Promise<readonly ProductSummary[]> {
    const data = await this.client.execute<{ products: { nodes: ProductNode[] } }>(
      'query Products { products(first: 100) { nodes { id title handle description featuredImage { url } priceRange { minVariantPrice { amount currencyCode } } totalInventory } } }',
    )
    return data.products.nodes.map(product => ({
      id: ShopifyProductId(product.id), title: product.title, handle: product.handle,
      description: product.description,
      ...(product.featuredImage ? { imageUrl: product.featuredImage.url } : {}),
      price: product.priceRange.minVariantPrice.amount,
      currency: product.priceRange.minVariantPrice.currencyCode,
      available: (product.totalInventory ?? 0) > 0,
    }))
  }
  async listCollections(_spec: ShopifyStoreSpec): Promise<readonly CollectionSummary[]> {
    const data = await this.client.execute<{
      collections: { nodes: Array<{ id: string; title: string; handle: string; products: { nodes: Array<{ id: string }> } }> }
    }>('query Collections { collections(first: 100) { nodes { id title handle products(first: 100) { nodes { id } } } } }')
    return data.collections.nodes.map(collection => ({
      id: ShopifyCollectionId(collection.id), title: collection.title, handle: collection.handle,
      productIds: collection.products.nodes.map(product => ShopifyProductId(product.id)),
    }))
  }
  async listThemes(_spec: ShopifyStoreSpec): Promise<readonly ThemeSummary[]> {
    const data = await this.client.execute<{
      themes: { nodes: Array<{ id: string; name: string; role: string }> }
    }>('query Themes { themes(first: 20) { nodes { id name role } } }')
    return data.themes.nodes.map(theme => ({
      id: ShopifyThemeId(theme.id), name: theme.name,
      role: theme.role === 'MAIN' ? 'main' : theme.role === 'UNPUBLISHED' ? 'unpublished' : 'other',
    }))
  }
  async publish(spec: ShopifyStoreSpec, request: PublishRequest): Promise<PublishResult> {
    if (this.mode !== 'oauth' || spec.mode !== 'oauth') throw new Error('Shopify theme publication requires OAuth Admin access')
    if (!/^gid:\/\/shopify\/Theme\//.test(request.themeId)) throw new Error('invalid Shopify theme id')
    const entries = Object.entries(request.files)
    if (entries.length === 0) throw new Error('Shopify publication requires at least one file')
    for (const [path, body] of entries) {
      if (!/^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
        throw new Error(`unapproved Shopify theme path: ${path}`)
      }
      if (typeof body !== 'string') throw new Error(`Shopify theme file '${path}' must be text`)
    }
    const data = await this.client.execute<{
      themeFilesUpsert: {
        upsertedThemeFiles: Array<{ filename: string }>
        userErrors: Array<{ field?: string[]; message: string }>
      }
    }>(
      'mutation ThemeFilesUpsert($theme: ID!, $files: [OnlineStoreThemeFileInput!]!) { themeFilesUpsert(theme: $theme, files: $files) { upsertedThemeFiles { filename } userErrors { field message } } }',
      { theme: request.themeId, files: entries.map(([filename, body]) => ({ filename, body })) },
    )
    const result = data.themeFilesUpsert
    if (result.userErrors.length > 0) throw new Error(`Shopify theme publication failed: ${result.userErrors.map(error => error.message).join('; ')}`)
    return {
      connectionId: spec.connectionId, themeId: request.themeId,
      publishedAt: new Date().toISOString(), version: request.idempotencyKey,
      filesWritten: result.upsertedThemeFiles.length,
    }
  }
}
