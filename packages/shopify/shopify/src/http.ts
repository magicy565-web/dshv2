import { createHmac, timingSafeEqual } from 'node:crypto'
import { verifyShopifyHmac } from './client.ts'

export interface OAuthRequest { readonly query: Readonly<Record<string, string | undefined>>; readonly expectedState: string }
export interface WebhookRequest { readonly body: string; readonly hmac: string; readonly secret: string; readonly eventId: string }

/** Parse and validate the query values Shopify sends to an OAuth callback. */
export function parseOAuthRequest(request: OAuthRequest): { code: string; shop: string; state: string; hmac: string } {
  const code = request.query.code; const shop = request.query.shop; const state = request.query.state; const hmac = request.query.hmac
  if (!code || !shop || !state || !hmac) throw new Error('OAuth callback is missing required parameters')
  if (state !== request.expectedState) throw new Error('invalid OAuth state')
  return { code, shop, state, hmac }
}

/** Verify a raw webhook body and return an authenticated event envelope. */
export function verifyWebhookRequest(request: WebhookRequest): { eventId: string; body: string } {
  const expected = createHmac('sha256', request.secret).update(request.body).digest('base64')
  const left = Buffer.from(expected); const right = Buffer.from(request.hmac)
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error('invalid Shopify webhook HMAC')
  if (!request.eventId) throw new Error('Shopify webhook is missing event id')
  return { eventId: request.eventId, body: request.body }
}

/** Validate OAuth query HMAC after removing the hmac field. */
export function verifyOAuthQueryHmac(query: URLSearchParams, secret: string): boolean {
  const hmac = query.get('hmac'); if (!hmac) return false
  return verifyShopifyHmac(query, hmac, secret)
}
