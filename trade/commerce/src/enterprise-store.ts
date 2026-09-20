/** Credential-free Shopify selection and launch pinning through the existing enterprise. */
import { z } from 'zod'
import { BusinessError } from './database.ts'
import type { CommerceService } from './service.ts'
import type { Id, Principal } from './schema.ts'
import type { EnterpriseLink } from './enterprise-link.ts'
import type { ShopifyProvider } from './shopify.ts'
import { publicationList, storeBinding, storeList, storeOperation } from './store-wire.ts'
import type { StoreOperation, StoreBinding } from './store-wire.ts'

/** Bounded bridge transport settings supplied by the deployment. */
export const enterpriseStoreConfig = z.object({ timeoutMs: z.number().int().positive(), maxResponseBytes: z.number().int().positive() }).strict()

/** Store metadata stays in Commerce; Shopify tokens remain in the enterprise Host. */
export class EnterpriseStore {
  constructor(readonly service: CommerceService, readonly link: EnterpriseLink, readonly config: z.infer<typeof enterpriseStoreConfig>, readonly transport: typeof fetch = fetch) {}
  private assertOwner(merchantId: Id) { if (merchantId !== this.link.config.merchantId) throw new BusinessError('shopify_not_connected', 503) }
  private async call(operation: StoreOperation): Promise<unknown> {
    this.assertOwner(operation.merchantId)
    const result = await this.transport(new URL('/commerce/v1/shopify', this.link.config.returnUrl), { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${this.link.config.token}`, 'content-type': 'application/json' }, body: JSON.stringify(storeOperation.parse(operation)), signal: AbortSignal.timeout(this.config.timeoutMs) })
    const reader = result.body?.getReader(); if (!reader) throw new BusinessError('shopify_request_failed', 502)
    const parts: Uint8Array[] = []; let size = 0
    try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > this.config.maxResponseBytes) { await reader.cancel(); throw new BusinessError('shopify_response_too_large', 502) } parts.push(chunk.value) } }
    finally { reader.releaseLock() }
    const body: unknown = JSON.parse(Buffer.concat(parts).toString('utf8'))
    if (!result.ok) {
      const error = z.object({ error: z.string() }).parse(body).error
      const exposed = ['shopify_not_connected', 'shopify_scope_missing', 'shopify_store_changed', 'shopify_currency_mismatch', 'shopify_product_ownership_mismatch', 'shopify_publication_unconfirmed']
      throw new BusinessError(exposed.includes(error) ? error : 'shopify_request_failed', 502)
    }
    return body
  }
  /** List existing connections without importing their credentials.
   * @param merchantId - Server-resolved merchant.
   * @returns Safe store metadata.
   */
  async stores(merchantId: Id) { return storeList.parse(await this.call({ merchantId, operation: 'stores' })) }
  /** Read publication choices for a specific existing connection.
   * @param merchantId - Server-resolved merchant.
   * @param connectionId - Selected connection identity.
   * @returns Available targets and pagination state.
   */
  async publications(merchantId: Id, connectionId: string) { return publicationList.parse(await this.call({ merchantId, operation: 'publications', connectionId: storeBinding.shape.connectionId.parse(connectionId) })) }
  /** Save a verified selection for future launches; existing launch pins remain unchanged.
   * @param actor - Human merchant choosing the store.
   * @param input - Connection and publication ids; names are resolved from Shopify.
   * @returns Stored safe binding.
   */
  async select(actor: Principal, input: unknown) {
    if (actor.role !== 'merchant') throw new BusinessError('forbidden', 403)
    const value = storeBinding.pick({ connectionId: true, publicationId: true }).parse(input)
    const store = (await this.stores(actor.subjectId)).find(s => s.connectionId === value.connectionId)
    if (!store || store.status !== 'connected' || !store.credentialAvailable) throw new BusinessError('shopify_not_connected', 503)
    if (!store.scopes.includes('write_products') || !store.scopes.includes('write_publications')) throw new BusinessError('shopify_scope_missing')
    const publication = (await this.publications(actor.subjectId, value.connectionId)).nodes.find(p => p.id === value.publicationId)
    if (!publication) throw new BusinessError('shopify_store_changed')
    const binding = storeBinding.parse({ ...value, domain: store.domain, publicationName: publication.name })
    this.service.store.db.prepare('INSERT INTO commerce_store_bindings(merchant,data) VALUES(?,?) ON CONFLICT(merchant) DO UPDATE SET data=excluded.data').run(actor.subjectId, JSON.stringify(binding))
    return binding
  }
  /** Project the current store and immutable launch destinations.
   * @param actor - Authenticated business principal.
   * @returns Safe metadata or null for an unrelated principal.
   */
  status(actor: Principal) {
    if (!actor.role.startsWith('merchant') || actor.subjectId !== this.link.config.merchantId) return null
    const current = this.service.store.db.prepare('SELECT data FROM commerce_store_bindings WHERE merchant=?').get(actor.subjectId)
    return { selected: current ? storeBinding.parse(JSON.parse(String(current.data))) : null, launches: this.service.store.db.prepare('SELECT launch,data FROM launch_store_bindings WHERE merchant=?').all(actor.subjectId).map(row => ({ launchId: String(row.launch), ...storeBinding.parse(JSON.parse(String(row.data))) })) }
  }
  /** Resolve a provider after business authorization, inside the gateway checkpoint transaction.
   * @param merchantId - Authorized merchant.
   * @param launchId - Optional launch to pin before its first draft attempt.
   * @returns Typed bridge capability for exactly this destination.
   */
  resolve(merchantId: Id, launchId?: Id): ShopifyProvider {
    this.assertOwner(merchantId)
    const db = this.service.store.db
    let binding: StoreBinding
    const pinned = launchId ? db.prepare('SELECT data FROM launch_store_bindings WHERE launch=? AND merchant=?').get(launchId, merchantId) : undefined
    if (pinned) binding = storeBinding.parse(JSON.parse(String(pinned.data)))
    else {
      if (launchId) {
        const launch = this.service.store.require('launch', launchId)
        if (launch.merchantId !== merchantId) throw new BusinessError('forbidden', 403)
        if (launch.shopifyProductId) throw new BusinessError('shopify_store_changed')
      }
      const current = db.prepare('SELECT data FROM commerce_store_bindings WHERE merchant=?').get(merchantId)
      if (!current) throw new BusinessError('shopify_not_connected', 503)
      binding = storeBinding.parse(JSON.parse(String(current.data)))
      if (launchId) db.prepare('INSERT INTO launch_store_bindings(launch,merchant,data) VALUES(?,?,?)').run(launchId, merchantId, JSON.stringify(binding))
    }
    const { publicationName: _name, ...destination } = binding
    return {
      readCatalog: () => this.call({ operation: 'catalog', merchantId, destination }),
      draft: async (launch, listing) => z.object({ productId: z.string().regex(/^gid:\/\/shopify\/Product\/\d+$/) }).strict().parse(await this.call({ operation: 'draft', merchantId, destination, launch, listing })).productId,
      publish: async (productId, key) => { z.object({ ok: z.literal(true) }).strict().parse(await this.call({ operation: 'publish', merchantId, destination, productId, launchId: key })) },
      isPublished: async (productId, key) => z.object({ published: z.boolean() }).strict().parse(await this.call({ operation: 'inspect', merchantId, destination, productId, launchId: key })).published,
    }
  }
}
