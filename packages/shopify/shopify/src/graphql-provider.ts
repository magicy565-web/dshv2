import { ShopifyApiError, type ShopifyGraphqlClient } from './client.ts'
import type { CollectionSummary, ProductSummary, PublishRequest, PublishResult, ShopifyStoreSpec, ThemeSummary } from './types.ts'
import type { ShopifyStoreProvider } from './service.ts'
import { ShopifyProductId, ShopifyCollectionId, ShopifyThemeId } from './types.ts'
import { setTimeout as delay } from 'node:timers/promises'

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
  constructor(private readonly client: ShopifyGraphqlClient, readonly mode: 'public' | 'oauth' = 'oauth', private readonly completion?: { pollIntervalMs: number; maxPollAttempts: number; signal: AbortSignal }) {}
  private async write<T>(query: string, variables: Readonly<Record<string, unknown>>): Promise<T> {
    try { return await this.client.execute<T>(query, variables) }
    catch (error) {
      if (error instanceof ShopifyApiError && error.kind === 'transient') throw new Error('Shopify write outcome is unknown; reconcile provider state before retrying', { cause: error })
      throw error
    }
  }
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
    if (!/^gid:\/\/shopify\/OnlineStoreTheme\/\d+$/.test(request.themeId)) throw new Error('invalid Shopify theme id')
    const entries = Object.entries(request.files)
    if (entries.length === 0) throw new Error('Shopify publication requires at least one file')
    if (entries.length > 50) throw new Error('Shopify publication supports at most 50 approved files per revision')
    for (const [path, body] of entries) {
      if (!/^(assets|config|layout|locales|sections|snippets|templates)\/[A-Za-z0-9._/-]+$/.test(path) || path.includes('..')) {
        throw new Error(`unapproved Shopify theme path: ${path}`)
      }
      if (typeof body !== 'string') throw new Error(`Shopify theme file '${path}' must be text`)
    }
    const data = await this.write<{
      themeFilesUpsert: {
        upsertedThemeFiles: Array<{ filename: string }>
        job?: { id: string; done: boolean } | null
        userErrors: Array<{ field?: string[]; message: string }>
      }
    }>(
      'mutation ThemeFilesUpsert($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) { themeFilesUpsert(themeId: $themeId, files: $files) { upsertedThemeFiles { filename } job { id done } userErrors { field message } } }',
      { themeId: request.themeId, files: entries.map(([filename, body]) => ({ filename, body: { type: 'TEXT', value: body } })) },
    )
    const result = data.themeFilesUpsert
    if (result.userErrors.length > 0) throw new Error(`Shopify theme publication failed: ${result.userErrors.map(error => error.message).join('; ')}`)
    if (result.job && !result.job.done) {
      if (!this.completion) throw new Error('Shopify theme write is pending; configure completion polling and reconcile before retrying')
      let done = false
      for (let attempt = 0; attempt < this.completion.maxPollAttempts; attempt++) {
        await delay(this.completion.pollIntervalMs, undefined, { signal: this.completion.signal })
        const observation = await this.client.execute<{ job: { id: string; done: boolean } | null }>('query ThemeWriteJob($id: ID!) { job(id: $id) { id done } }', { id: result.job.id }).catch((error: unknown) => { throw new Error('Shopify pending write could not be observed; reconcile before retrying', { cause: error }) })
        if (observation.job?.id !== result.job.id) throw new Error('Shopify theme write job could not be reconciled')
        if (observation.job.done) { done = true; break }
      }
      if (!done) throw new Error('Shopify theme write is still pending; reconcile before retrying')
    }
    if (!result.job && entries.some(([path]) => !result.upsertedThemeFiles.some(file => file.filename === path))) throw new Error('Shopify did not confirm every theme file')
    const promoted = await this.write<{ themePublish: { theme: { id: string } | null; userErrors: { message: string }[] } }>('mutation SiteThemePublish($id: ID!) { themePublish(id: $id) { theme { id } userErrors { message } } }', { id: request.themeId })
    if (promoted.themePublish.userErrors.length || promoted.themePublish.theme?.id !== request.themeId) throw new Error('Shopify theme promotion was not confirmed')
    const observed = await this.client.execute<{ theme: { id: string; role: string } | null }>('query PublishedSiteTheme($id: ID!) { theme(id: $id) { id role } }', { id: request.themeId })
    if (observed.theme?.id !== request.themeId || observed.theme.role !== 'MAIN') throw new Error('Shopify live theme was not confirmed; reconcile before retrying')
    return {
      connectionId: spec.connectionId, themeId: request.themeId,
      publishedAt: new Date().toISOString(), version: request.idempotencyKey,
      filesWritten: entries.length,
    }
  }
}
