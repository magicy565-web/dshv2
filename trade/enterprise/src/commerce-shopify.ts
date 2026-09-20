/** Typed commerce operations executed by the existing Shopify credential owner. */
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { BusinessError } from '../../commerce/src/database.ts'
import { shopifyProvider, shopifyPublications } from '../../commerce/src/shopify.ts'
import { storeOperation, storeList } from '../../commerce/src/store-wire.ts'
import type { shopifyStore } from './shopify-store.ts'
import type { commerceLinkConfig } from './commerce-link.ts'
import { decryptToken } from './shopify-site.ts'

/** Host-owned configuration; credentials are read fresh for every operation. */
export interface CommerceShopifyConfig {
  commerce: z.infer<typeof commerceLinkConfig>
  apiVersion: string
  encryptionKey: Buffer | null
  shopDomain?: string | undefined
  accessToken?: string | undefined
}

/** Dispatch authenticated bridge requests without exposing a generic Shopify proxy.
 * @param config - Bound merchant, server token and Shopify settings.
 * @param stores - Existing enterprise SQLite connection owner.
 * @param transport - Instance-local Shopify HTTP transport.
 * @returns Web handler with bounded JSON and safe error responses.
 */
export function commerceShopify(config: CommerceShopifyConfig, stores: ReturnType<typeof shopifyStore>, transport: typeof fetch = fetch) {
  const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
  const credential = (connection: ReturnType<typeof stores.connections>[number]) => {
    const encrypted = stores.token(connection.id)
    return encrypted && config.encryptionKey ? decryptToken(encrypted, config.encryptionKey) : connection.mode === 'managed' && connection.shopDomain === config.shopDomain ? config.accessToken : undefined
  }
  return async (request: Request): Promise<Response> => {
    try {
      if (request.headers.has('origin')) throw new BusinessError('forbidden', 403)
      const received = Buffer.from(request.headers.get('authorization') ?? ''), expected = Buffer.from(`Bearer ${config.commerce.token}`)
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new BusinessError('unauthorized', 401)
      if (request.method !== 'POST') throw new BusinessError('method_not_allowed', 405)
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new BusinessError('json_required', 415)
      const reader = request.body?.getReader(); if (!reader) throw new BusinessError('body_required', 400)
      const parts: Uint8Array[] = []; let size = 0
      try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > config.commerce.maxBodyBytes) { await reader.cancel(); throw new BusinessError('body_too_large', 413) } parts.push(chunk.value) } }
      finally { reader.releaseLock() }
      const op = storeOperation.parse(JSON.parse(Buffer.concat(parts).toString('utf8')))
      if (!config.commerce.merchantId || op.merchantId !== config.commerce.merchantId) throw new BusinessError('forbidden', 403)
      if (op.operation === 'stores') return response(storeList.parse(stores.connections().map(c => ({ connectionId: c.id, domain: c.shopDomain, status: c.status, scopes: c.scopes, credentialAvailable: Boolean(credential(c)) }))))
      const connectionId = op.operation === 'publications' ? op.connectionId : op.destination.connectionId
      const connection = stores.connections().find(c => String(c.id) === String(connectionId))
      if (!connection || connection.status !== 'connected') throw new BusinessError('shopify_not_connected', 503)
      if (op.operation !== 'publications' && op.destination.domain !== connection.shopDomain) throw new BusinessError('shopify_store_changed')
      const scopes = op.operation === 'publications' ? ['read_publications'] : op.operation === 'catalog' ? ['read_products'] : op.operation === 'draft' ? ['write_products'] : op.operation === 'publish' ? ['write_products', 'write_publications'] : ['read_products', 'read_publications']
      if (scopes.some(scope => !connection.scopes.includes(scope) && !(scope.startsWith('read_') && connection.scopes.includes(scope.replace('read_', 'write_'))))) throw new BusinessError('shopify_scope_missing')
      const accessToken = credential(connection)
      if (!accessToken) throw new BusinessError('shopify_not_connected', 503)
      const settings = { domain: connection.shopDomain, accessToken, apiVersion: config.apiVersion, timeoutMs: config.commerce.timeoutMs, maxResponseBytes: config.commerce.maxBodyBytes }
      const fetcher: typeof fetch = (url, init) => transport(url, { ...init, signal: init?.signal ? AbortSignal.any([request.signal, init.signal]) : request.signal })
      if (op.operation === 'publications') return response(await shopifyPublications(settings, fetcher))
      const provider = shopifyProvider({ ...settings, publicationId: op.destination.publicationId }, fetcher)
      switch (op.operation) {
        case 'catalog': return response(await provider.readCatalog())
        case 'draft':
          if (op.launch.merchantId !== op.merchantId || op.listing.merchantId !== op.merchantId || op.listing.launchId !== op.launch.id || !['PREPARING', 'READY'].includes(op.launch.status)) throw new BusinessError('forbidden', 403)
          return response({ productId: await provider.draft(op.launch, op.listing) })
        case 'publish': await provider.publish(op.productId, op.launchId); return response({ ok: true })
        case 'inspect': return response({ published: await provider.isPublished(op.productId, op.launchId) })
        default: { const unreachable: never = op; throw new Error(String(unreachable)) }
      }
    } catch (error) {
      if (error instanceof BusinessError) return response({ error: error.code }, error.status)
      if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: 'validation_failed' }, 400)
      return response({ error: 'shopify_request_failed' }, 502)
    }
  }
}
