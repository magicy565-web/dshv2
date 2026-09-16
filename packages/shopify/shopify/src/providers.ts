import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import type {
  CollectionSummary, ProductSummary, PublishRequest, PublishResult, ShopifyResolveRequest,
  ShopifyStoreSpec, StoreConnection, StoreConnectionId, StoreMode, ThemeSummary, TenantId,
} from './types.ts'
import { ShopifyStoreService, type ShopifyStoreProvider } from './service.ts'

const PUBLIC_CONNECTION = brandString<StoreConnectionId>('public-store')

/** Simple provider used by the public-store MVP and deterministic tests. */
export class PublicStoreProvider implements ShopifyStoreProvider {
  readonly mode: StoreMode = 'public'
  constructor(
    private readonly products: ProductSummary[] = [],
    private readonly collections: CollectionSummary[] = [],
    private readonly themes: ThemeSummary[] = [],
  ) {}
  async listProducts(): Promise<readonly ProductSummary[]> { return [...this.products] }
  async listCollections(): Promise<readonly CollectionSummary[]> { return [...this.collections] }
  async listThemes(): Promise<readonly ThemeSummary[]> { return [...this.themes] }
  async publish(spec: ShopifyStoreSpec, request: PublishRequest): Promise<PublishResult> {
    return { connectionId: spec.connectionId, themeId: request.themeId, publishedAt: new Date().toISOString(), version: request.idempotencyKey, filesWritten: Object.keys(request.files).length }
  }
}

/** Provider backed by one OAuth connection's token and catalog projections. */
export class OAuthStoreProvider extends PublicStoreProvider {
  override readonly mode: 'oauth' = 'oauth'
  constructor(readonly connection: StoreConnection, products: ProductSummary[] = [], collections: CollectionSummary[] = [], themes: ThemeSummary[] = []) {
    super(products, collections, themes)
  }
}

/** In-memory service composition for the MVP; production adapters can implement the same seam. */
export class InMemoryShopifyStoreService extends ShopifyStoreService {
  private readonly connections = new Map<StoreConnectionId, StoreConnection>()
  private readonly providers = new Map<StoreConnectionId, ShopifyStoreProvider>()
  constructor(ctx: Context, publicProvider = new PublicStoreProvider()) {
    super(ctx)
    const tenantId = brandString<TenantId>('platform')
    this.connections.set(PUBLIC_CONNECTION, { id: PUBLIC_CONNECTION, tenantId, mode: 'public', shopDomain: 'public.example.invalid', status: 'connected', grantedScopes: [] })
    this.providers.set(PUBLIC_CONNECTION, publicProvider)
  }
  resolve(request: ShopifyResolveRequest): ShopifyStoreSpec {
    const id = request.connectionId ?? PUBLIC_CONNECTION
    const connection = this.connections.get(id)
    if (connection === undefined || connection.tenantId !== request.tenantId) throw new Error('store connection is not available for this tenant')
    if (connection.status !== 'connected') throw new Error(`store connection '${id}' is ${connection.status}`)
    return { mode: connection.mode, connectionId: id, tenantId: request.tenantId, requiredScopes: connection.grantedScopes }
  }
  getConnection(id: StoreConnectionId): StoreConnection | undefined { return this.connections.get(id) }
  provider(spec: ShopifyStoreSpec): ShopifyStoreProvider {
    const provider = this.providers.get(spec.connectionId)
    if (provider === undefined) throw new Error(`store connection '${spec.connectionId}' has no provider`)
    return provider
  }
  registerOAuth(connection: StoreConnection, provider = new OAuthStoreProvider(connection)): void {
    this.connections.set(connection.id, connection)
    this.providers.set(connection.id, provider)
  }
  revoke(id: StoreConnectionId): void {
    const existing = this.connections.get(id)
    if (existing !== undefined) this.connections.set(id, { ...existing, status: 'revoked' })
  }
}

/** AES-256-GCM token vault. The key must be supplied by the deployment secret manager. */
export class EncryptedTokenVault {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('token vault key must be 32 bytes')
  }
  encrypt(token: string): string {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
    return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
  }
  decrypt(value: string): string {
    const [iv, tag, body] = value.split('.'); if (!iv || !tag || !body) throw new Error('invalid encrypted token')
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
  }
}

/** Deduplicates and orders webhook processing by event id. */
export class WebhookInbox {
  private readonly seen = new Set<string>()
  accept(eventId: string): boolean { if (this.seen.has(eventId)) return false; this.seen.add(eventId); return true }
}

export default InMemoryShopifyStoreService
