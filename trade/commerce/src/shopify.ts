/** Shopify Admin adapter and durable draft/publication checkpoints. */
import { z } from 'zod'
import { BusinessError, base } from './database.ts'
import type { CommerceService } from './service.ts'
import type { Id, Principal, Records } from './schema.ts'

/** Merchant-owned managed connection; credentials remain in deployment secrets. */
export const shopifyConfig = z.object({
  domain: z.string().regex(/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/), accessToken: z.string().min(1),
  apiVersion: z.string().regex(/^\d{4}-(01|04|07|10)$/), publicationId: z.string().regex(/^gid:\/\/shopify\/Publication\/\d+$/),
  timeoutMs: z.number().int().positive(), maxResponseBytes: z.number().int().positive(),
}).strict()
/** Narrow commerce execution capability. */
export interface ShopifyProvider {
  /** Read an existing catalog as input to merchant understanding. */
  readCatalog(): Promise<unknown>
  /** Upsert the launch's product with DRAFT status; never publish. */
  draft(launch: Records['launch'], listing: Records['listing']): Promise<string>
  /** Activate and publish an existing owned product, then verify visibility. */
  publish(productId: string, launchId: Id): Promise<void>
  /** Inspect publication without repeating a mutation after an uncertain response. */
  isPublished(productId: string, launchId: Id): Promise<boolean>
}
const errors = z.array(z.object({ message: z.string() }).passthrough())
const product = z.object({ id: z.string(), status: z.string(), metafield: z.object({ value: z.string() }).nullable(), publishedOnPublication: z.boolean().optional() }).passthrough()
const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function graphql(config: Omit<z.infer<typeof shopifyConfig>, 'publicationId'>, fetcher: typeof fetch) {
  const request = async (query: string, variables: unknown): Promise<Record<string, unknown>> => {
    const r = await fetcher(`https://${config.domain}/admin/api/${config.apiVersion}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': config.accessToken }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(config.timeoutMs), redirect: 'error' })
    if (!r.ok) throw new BusinessError('shopify_request_failed', 502)
    const reader = r.body?.getReader(); if (!reader) throw new BusinessError('shopify_response_empty', 502)
    let size = 0; const chunks: Uint8Array[] = []
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > config.maxResponseBytes) { await reader.cancel(); throw new BusinessError('shopify_response_too_large', 502) } chunks.push(chunk.value) } }
    finally { reader.releaseLock() }
    const body = z.object({ data: z.record(z.string(), z.unknown()).optional(), errors: errors.optional() }).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    if (body.errors?.length || !body.data) throw new BusinessError('shopify_graphql_failed', 502)
    for (const value of Object.values(body.data)) if (value && typeof value === 'object' && 'userErrors' in value && errors.parse(value.userErrors).length) throw new BusinessError('shopify_mutation_rejected', 502)
    return body.data
  }
  return request
}

/** Read publication targets without giving the caller Shopify credentials.
 * @param input - Validated store credentials and transport limits.
 * @param fetcher - Instance-owned HTTP transport.
 * @returns First 50 publication names and whether more exist.
 */
export async function shopifyPublications(input: Omit<z.infer<typeof shopifyConfig>, 'publicationId'>, fetcher: typeof fetch = fetch) {
  const config = shopifyConfig.omit({ publicationId: true }).parse(input)
  const data = await graphql(config, fetcher)('query{publications(first:50){nodes{id name} pageInfo{hasNextPage}}}', {})
  const result = z.object({ nodes: z.array(z.object({ id: shopifyConfig.shape.publicationId, name: z.string().min(1).max(300) })), pageInfo: z.object({ hasNextPage: z.boolean() }) }).parse(data.publications)
  return { nodes: result.nodes, hasMore: result.pageInfo.hasNextPage }
}

/** Create a bounded GraphQL adapter for one validated store.
 * @param input - Deployment configuration.
 * @param fetcher - Instance-local transport for wire verification.
 * @returns Shopify capability.
 */
export function shopifyProvider(input: z.infer<typeof shopifyConfig>, fetcher: typeof fetch = fetch): ShopifyProvider {
  const config = shopifyConfig.parse(input)
  const request = graphql(config, fetcher)
  const inspect = async (productId: string, launchId: Id) => {
    const data = await request('query($id:ID!,$publication:ID!){product(id:$id){id status metafield(namespace:"commerce_workspace",key:"launch_id"){value} publishedOnPublication(publicationId:$publication)}}', { id: productId, publication: config.publicationId })
    const result = product.parse(data.product)
    if (result.metafield?.value !== launchId) throw new BusinessError('shopify_product_ownership_mismatch')
    return result
  }
  return {
    async readCatalog() {
      return request('query{shop{name currencyCode primaryDomain{url}} products(first:50){nodes{id title productType tags priceRangeV2{minVariantPrice{amount currencyCode} maxVariantPrice{amount currencyCode}}} pageInfo{hasNextPage endCursor}} collections(first:50){nodes{id title} pageInfo{hasNextPage endCursor}}}', {})
    },
    async draft(launch, listing) {
      const shop = z.object({ currencyCode: z.string() }).parse((await request('query{shop{currencyCode}}', {})).shop)
      if (shop.currencyCode !== launch.currency) throw new BusinessError('shopify_currency_mismatch')
      const handle = `cw-${launch.id}`
      const found = await request('query($identifier:ProductIdentifierInput!){productByIdentifier(identifier:$identifier){id status metafield(namespace:"commerce_workspace",key:"launch_id"){value}}}', { identifier: { handle } })
      if (found.productByIdentifier) {
        const p = product.parse(found.productByIdentifier)
        if (p.metafield?.value !== launch.id || p.status !== 'DRAFT') throw new BusinessError('shopify_product_ownership_mismatch')
      }
      const data = await request('mutation($input:ProductSetInput!,$identifier:ProductSetIdentifiers!){productSet(input:$input,identifier:$identifier,synchronous:true){product{id status} userErrors{message}}}', {
        identifier: { handle }, input: {
          handle, title: listing.title, descriptionHtml: listing.description.split('\n').map(p => `<p>${escape(p)}</p>`).join(''), status: 'DRAFT', tags: listing.tags,
          seo: { title: listing.seo.title.slice(0, 70), description: listing.seo.description.slice(0, 320) }, files: listing.images.map(originalSource => ({ originalSource, contentType: 'IMAGE' })),
          productOptions: [{ name: 'Variant', values: listing.variants.map(name => ({ name })) }],
          variants: listing.variants.map(name => ({ optionValues: [{ optionName: 'Variant', name }], price: String(launch.targetPrice) })),
          metafields: [{ namespace: 'commerce_workspace', key: 'launch_id', type: 'single_line_text_field', value: launch.id }],
        },
      })
      const result = z.object({ product: z.object({ id: z.string(), status: z.literal('DRAFT') }) }).parse(data.productSet)
      return result.product.id
    },
    async publish(productId, launchId) {
      await inspect(productId, launchId)
      await request('mutation($product:ProductUpdateInput!){productUpdate(product:$product){product{id status} userErrors{message}}}', { product: { id: productId, status: 'ACTIVE' } })
      await request('mutation($id:ID!,$publication:ID!){publishablePublish(id:$id,input:[{publicationId:$publication}]){userErrors{message}}}', { id: productId, publication: config.publicationId })
      const p = await inspect(productId, launchId)
      if (p.status !== 'ACTIVE' || !p.publishedOnPublication) throw new BusinessError('shopify_publication_unconfirmed', 502)
    },
    async isPublished(productId, launchId) { const p = await inspect(productId, launchId); return p.status === 'ACTIVE' && p.publishedOnPublication === true },
  }
}

/** Execute externally visible actions with persistent recovery checkpoints. */
export class ShopifyGateway {
  constructor(readonly service: CommerceService, readonly resolve: (merchantId: Id, launchId?: Id) => ShopifyProvider) {}
  /** Import the exact current launch into a merchant's configured Shopify store as a draft.
   * @param actor - Merchant or scoped agent.
   * @param key - Launch id.
   * @param expectedRevision - Observed launch version.
   * @returns Persisted launch with remote product mapping.
   */
  async draft(actor: Principal, key: Id, expectedRevision: number) {
    const s = this.service.store
    const { launch, listing, provider } = s.transaction(() => {
      const launch = s.require('launch', key, expectedRevision)
      if (!actor.role.startsWith('merchant') || launch.merchantId !== actor.subjectId) throw new BusinessError('forbidden', 403)
      this.service.assertLaunchCurrent(launch)
      const listing = s.list('listing').find(l => l.launchId === key)!
      if (!['PREPARING', 'READY'].includes(launch.status) || listing.operation === 'DRAFTING') throw new BusinessError('draft_unavailable')
      const provider = this.resolve(actor.subjectId, launch.id)
      s.put('listing', { ...listing, operation: 'DRAFTING', revision: listing.revision + 1, updatedAt: this.service.clock() })
      return { launch, listing, provider }
    })
    try {
      const productId = await provider.draft(launch, listing)
      return s.transaction(() => {
        this.service.assertLaunchCurrent(launch)
        const l = s.require('launch', key, expectedRevision), current = s.require('listing', listing.id)
        s.put('listing', { ...current, status: 'DRAFT', operation: 'IDLE', revision: current.revision + 1, updatedAt: this.service.clock() })
        return s.put('launch', { ...l, status: 'READY', shopifyProductId: productId, revision: l.revision + 1, updatedAt: this.service.clock() })
      })
    } catch (error) { s.transaction(() => { const current = s.require('listing', listing.id); s.put('listing', { ...current, operation: 'UNCERTAIN', revision: current.revision + 1, updatedAt: this.service.clock() }) }); throw error }
  }
  /** Publish a reviewed launch or inspect an uncertain operation without resending it.
   * @param actor - Merchant human; agents cannot publish.
   * @param approvalId - Exact approved launch/listing versions.
   * @param reconcile - Read-only provider recovery after an interrupted publish.
   * @returns Executed approval; uncertainty remains durable on failure.
   */
  async publish(actor: Principal, approvalId: Id, reconcile = false) {
    const s = this.service.store
    const { approval, launch, provider } = s.transaction(() => {
      const approval = s.require('approval', approvalId), launch = s.require('launch', approval.launchId)
      if (actor.role !== 'merchant' || approval.merchantId !== actor.subjectId) throw new BusinessError('forbidden', 403)
      if (approval.status === 'EXECUTED') return { approval, launch, provider: null }
      if (reconcile ? !['EXECUTING', 'UNCERTAIN'].includes(approval.status) : approval.status !== 'APPROVED') throw new BusinessError('approval_required')
      const listing = s.list('listing').find(x => x.launchId === launch.id)!
      if (launch.revision !== approval.launchRevision || listing.revision !== approval.listingRevision || !launch.shopifyProductId) throw new BusinessError('approval_stale')
      this.service.assertLaunchCurrent(launch)
      const provider = this.resolve(actor.subjectId, launch.id)
      s.put('approval', { ...approval, status: 'EXECUTING', revision: approval.revision + 1, updatedAt: this.service.clock() })
      return { approval, launch, provider }
    })
    if (!provider) return approval
    try {
      if (reconcile) { if (!await provider.isPublished(launch.shopifyProductId!, launch.id)) throw new BusinessError('publication_requires_inspection') }
      else await provider.publish(launch.shopifyProductId!, launch.id)
      return s.transaction(() => {
        const now = this.service.clock(), current = s.require('approval', approvalId), l = s.require('launch', launch.id, launch.revision)
        s.put('launch', { ...l, status: 'LIVE', launchDate: now, updatedAt: now, revision: l.revision + 1 })
        const listing = s.list('listing').find(x => x.launchId === l.id)!
        s.put('listing', { ...listing, status: 'PUBLISHED', revision: listing.revision + 1, updatedAt: now })
        s.put('activity', { ...base(now), ownerId: actor.subjectId, actor: actor.role, action: 'shopify.publish', targetId: l.id, detail: '' })
        return s.put('approval', { ...current, status: 'EXECUTED', revision: current.revision + 1, updatedAt: now })
      })
    } catch (error) { s.transaction(() => { const current = s.require('approval', approvalId); s.put('approval', { ...current, status: 'UNCERTAIN', revision: current.revision + 1, updatedAt: this.service.clock() }) }); throw error }
  }
}
