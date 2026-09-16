import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

type Brand<T, B extends string> = T & { readonly __brand: B }
export type StoreConnectionId = Brand<string, 'StoreConnectionId'>
export type PublishJobId = Brand<string, 'PublishJobId'>
export type StoreMode = 'managed' | 'oauth'
export type ConnectionStatus = 'pending' | 'connected' | 'revoked' | 'failed'
export type PublishJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface StoreConnection { id: StoreConnectionId; mode: StoreMode; shopDomain: string; status: ConnectionStatus; scopes: string[]; createdAt: string; updatedAt: string }
export interface PublishJob { id: PublishJobId; connectionId: StoreConnectionId; productId: string; revision: number; handle?: string; idempotencyKey: string; status: PublishJobStatus; attempts: number; error?: string; createdAt: string; updatedAt: string }
export interface PublishAttempt { jobId: PublishJobId; attempt: number; status: 'started' | 'succeeded' | 'failed'; error?: string; startedAt: string; finishedAt?: string }

/** Create a tenant-scoped store connection record without storing credentials. */
export function storeConnection(input: Omit<StoreConnection, 'id'> & { id: string }): StoreConnection { return { ...input, id: input.id as StoreConnectionId } }

/** Create a stable publication job identity for one product revision and store. */
export function publishJob(input: Omit<PublishJob, 'id' | 'idempotencyKey'> & { id: string }): PublishJob {
  return { ...input, id: input.id as PublishJobId, idempotencyKey: `${input.connectionId}:${input.productId}:${input.revision}` }
}

/** Build the Shopify authorization URL for a user-owned store connection. */
export function oauthAuthorize(config: { shopDomain: string; clientId: string; redirectUri: string; scopes: string[]; state: string }): string {
  const query = new URLSearchParams({ client_id: config.clientId, scope: config.scopes.join(','), redirect_uri: config.redirectUri, state: config.state })
  return `https://${config.shopDomain}/admin/oauth/authorize?${query}`
}

/** Verify the callback HMAC before exchanging an authorization code. */
export function verifyOAuthHmac(query: Record<string, string>, secret: string): boolean {
  const supplied = query.hmac
  if (!supplied) return false
  const message = Object.keys(query).filter(key => key !== 'hmac' && key !== 'signature').sort().map(key => `${key}=${query[key]}`).join('&')
  const expected = createHmac('sha256', secret).update(message).digest('hex')
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

/** Require the callback state to match the tenant's pending authorization request. */
export function verifyOAuthState(received: string | undefined, expected: string): boolean {
  if (!received || received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected))
}

/** Verify Shopify's base64 HMAC over the exact webhook request body. */
export function verifyWebhookHmac(body: string, supplied: string | null, secret: string): boolean {
  if (!supplied) return false
  const expected = createHmac('sha256', secret).update(body).digest('base64')
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}

/** Deduplicate webhook deliveries by Shopify's delivery identifier. */
export function acceptWebhook(id: string, seen: Set<string>): boolean { if (seen.has(id)) return false; seen.add(id); return true }

/** Encrypt an offline Shopify token before it enters deployment-owned storage. */
export function encryptToken(token: string, key: Buffer): string {
  if (key.byteLength !== 32) throw new Error('Shopify token key must be 32 bytes')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
  return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`
}

/** Decrypt a token stored by encryptToken. */
export function decryptToken(value: string, key: Buffer): string {
  if (key.byteLength !== 32) throw new Error('Shopify token key must be 32 bytes')
  const [iv, ciphertext, tag] = value.split('.').map(part => Buffer.from(part, 'base64url'))
  if (!iv || !ciphertext || !tag) throw new Error('Invalid encrypted Shopify token')
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
