import { randomBytes } from 'node:crypto'
import { verifyShopifyHmac, ShopifyGraphqlClient } from './client.ts'

export interface OAuthConfig { readonly clientId: string; readonly clientSecret: string; readonly redirectUri: string; readonly scopes: readonly string[] }
export interface OAuthCallback { readonly code: string; readonly shop: string; readonly state: string; readonly hmac: string }
export interface OfflineTokenResponse { readonly access_token: string; readonly scope: string }

/** Create a CSRF state value for one OAuth attempt. */
export function createOAuthState(): string { return randomBytes(24).toString('base64url') }

/** Build Shopify's authorization URL for the requested shop and state. */
export function buildOAuthUrl(shop: string, state: string, config: OAuthConfig): string {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) throw new Error('invalid Shopify shop domain')
  const params = new URLSearchParams({ client_id: config.clientId, scope: config.scopes.join(','), redirect_uri: config.redirectUri, state })
  return `https://${shop}/admin/oauth/authorize?${params}`
}

/** Validate callback state, shop and HMAC before exchanging an authorization code. */
export function validateOAuthCallback(callback: OAuthCallback, expectedState: string, config: OAuthConfig): void {
  if (callback.state !== expectedState) throw new Error('invalid OAuth state')
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(callback.shop)) throw new Error('invalid Shopify shop domain')
  const payload = new URLSearchParams({ code: callback.code, shop: callback.shop, state: callback.state })
  if (!verifyShopifyHmac(payload, callback.hmac, config.clientSecret)) throw new Error('invalid Shopify OAuth HMAC')
}

/** Exchange a validated authorization code for an offline access token. */
export async function exchangeOfflineToken(callback: OAuthCallback, config: OAuthConfig, fetcher: typeof fetch = fetch): Promise<OfflineTokenResponse> {
  const response = await fetcher(`https://${callback.shop}/admin/oauth/access_tokens`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code: callback.code }) })
  if (!response.ok) throw new Error(`Shopify OAuth token exchange failed (${response.status})`)
  return await response.json() as OfflineTokenResponse
}

/** Query a shop after authorization to detect revoked or insufficient access. */
export async function checkShopHealth(client: ShopifyGraphqlClient): Promise<boolean> {
  try { await client.execute('query { shop { id } }'); return true } catch { return false }
}
